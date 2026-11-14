#!/usr/bin/env python3
"""Local evaluation runner for the Wayfinder Pi package.

    python3 tools/pi_eval.py [PACKAGE_DIR] [--runs 1] [--ablation none|both] [--case NAME]
    python3 tools/pi_eval.py ./pi-package --runs 3 --ablation both --threshold 0.67
    python3 tools/pi_eval.py ./pi-package --eval-dir evals-live --runs 1 --ablation none

Uses `pi --mode json --no-session` in an isolated environment (no user skills,
extensions, prompt templates, or context files) so only the package under test
and the case's `allowed_tools` are active. Needs PyYAML.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_PACKAGE_DIR = REPO / "pi-package"
DEFAULT_TOOLS = ["read", "grep", "find", "ls", "wayfinder_ledger"]
CASE_TIMEOUT_SECONDS = 240


def split_front_matter(text):
    if not text.startswith("---\n"):
        raise ValueError("missing opening front matter delimiter")
    end = text.find("\n---", 4)
    if end == -1:
        raise ValueError("unclosed front matter block")
    rest = text[end + 4:]
    if rest.startswith("\n"):
        rest = rest[1:]
    return text[4:end], rest


def load_case(case_dir):
    import yaml

    case_dir = Path(case_dir)
    prompt_raw = (case_dir / "prompt.md").read_text(encoding="utf-8")
    front_raw, prompt_text = split_front_matter(prompt_raw)
    meta = yaml.safe_load(front_raw) or {}

    graders = []
    for path in sorted((case_dir / "graders").glob("*.md")):
        g_front, _ = split_front_matter(path.read_text(encoding="utf-8"))
        spec = yaml.safe_load(g_front) or {}
        spec["name"] = path.stem
        graders.append(spec)

    return {
        "name": case_dir.name,
        "dir": case_dir,
        "prompt": prompt_text.strip(),
        "allowed_tools": meta.get("allowed_tools") or list(DEFAULT_TOOLS),
        "packages": meta.get("packages"),
        "graders": graders,
    }


def parse_pi_json_stream(raw_text):
    """Parse strict LF-delimited JSONL records from `pi --mode json`.

    Per Pi's `docs/json.md`, records are separated strictly by LF (`\\n`), with an
    optional preceding `\\r` stripped. Unicode line separators inside JSON strings
    are not record boundaries.
    """
    tool_calls = []
    assistant_messages = []

    for raw_line in raw_text.split("\n"):
        line = raw_line[:-1] if raw_line.endswith("\r") else raw_line
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue

        etype = event.get("type")
        if etype == "tool_execution_start":
            tool_calls.append(
                {
                    "toolName": str(event.get("toolName") or ""),
                    "args": event.get("args") if isinstance(event.get("args"), dict) else {},
                }
            )
        elif etype == "message_end":
            msg = event.get("message")
            if isinstance(msg, dict) and msg.get("role") == "assistant":
                parts = msg.get("content") if isinstance(msg.get("content"), list) else []
                text = "".join(
                    str(part.get("text") or "")
                    for part in parts
                    if isinstance(part, dict) and part.get("type") == "text"
                )
                assistant_messages.append(text)

    final_text = assistant_messages[-1] if assistant_messages else ""
    return {"tool_calls": tool_calls, "final_text": final_text, "assistant_messages": assistant_messages}


def grade_tool_used(grader, trace):
    tool_pattern = str(grader.get("tool") or "")
    input_match = grader.get("input_match")
    min_calls = grader.get("min", 1)
    max_calls = grader.get("max")

    count = 0
    for call in trace["tool_calls"]:
        if tool_pattern and not re.fullmatch(tool_pattern, call["toolName"]):
            continue
        if input_match:
            serialized = json.dumps(call["args"], ensure_ascii=False)
            if not re.search(input_match, serialized):
                continue
        count += 1

    ok = count >= min_calls and (max_calls is None or count <= max_calls)
    return ok, count


def grade_regex(grader, trace):
    pattern = str(grader.get("pattern") or "")
    flags_str = str(grader.get("flags") or "")
    flags = 0
    if "i" in flags_str:
        flags |= re.IGNORECASE
    if "m" in flags_str:
        flags |= re.MULTILINE
    if "s" in flags_str:
        flags |= re.DOTALL

    matched = bool(re.search(pattern, trace["final_text"], flags=flags))
    mode = grader.get("match", "contains")
    ok = (not matched) if mode == "not_contains" else matched
    return ok


def is_indicator_grader(grader, with_baseline):
    """In a two-arm ablation run, positive route-load `tool_used` checks are indicators."""
    if not with_baseline:
        return False
    if grader.get("type") != "tool_used":
        return False
    return grader.get("arm") != "both"


def evaluate_case_trace(case, trace, with_baseline):
    route_fired = False
    scored = []
    for grader in case["graders"]:
        gtype = grader.get("type")
        if gtype == "tool_used":
            ok, count = grade_tool_used(grader, trace)
            if "route/SKILL" in str(grader.get("input_match") or "") and count > 0:
                route_fired = True
            if not is_indicator_grader(grader, with_baseline):
                scored.append(1.0 if ok else 0.0)
        elif gtype == "regex":
            ok = grade_regex(grader, trace)
            scored.append(1.0 if ok else 0.0)
    score = (sum(scored) / len(scored)) if scored else 1.0
    return score, route_fired


def build_pi_eval_command(pi_bin, case, package_dirs, model=None, thinking=None):
    cmd = [
        pi_bin,
        "--mode",
        "json",
        "--no-session",
        "--no-context-files",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--tools",
        ",".join(case["allowed_tools"]),
    ]
    if model:
        cmd += ["--model", model]
    if thinking:
        cmd += ["--thinking", thinking]
    for pkg in package_dirs:
        cmd += ["-e", str(pkg)]
    cmd += ["--", case["prompt"]]
    return cmd


def run_once(pi_bin, case, package_dirs, model=None, thinking=None, keep_temp=False, run=subprocess.run):
    temp_ctx = tempfile.mkdtemp(prefix=f"wayfinder-pi-eval-{case['name']}-")
    try:
        data_dir = Path(temp_ctx) / "data"
        env = {**os.environ, "PI_WAYFINDER_DATA": str(data_dir)}
        cmd = build_pi_eval_command(pi_bin, case, package_dirs, model=model, thinking=thinking)
        result = run(cmd, capture_output=True, text=True, timeout=CASE_TIMEOUT_SECONDS, env=env)
        if keep_temp:
            (Path(temp_ctx) / "trace.jsonl").write_text(result.stdout or "", encoding="utf-8")
            (Path(temp_ctx) / "stderr.txt").write_text(result.stderr or "", encoding="utf-8")
        return parse_pi_json_stream(result.stdout or ""), temp_ctx if keep_temp else None
    finally:
        if not keep_temp:
            shutil.rmtree(temp_ctx, ignore_errors=True)


def resolve_case_packages(case, default_package_dir):
    if not case["packages"]:
        return [Path(default_package_dir).resolve()]
    return [(case["dir"] / rel).resolve() for rel in case["packages"]]


def measure_package(pkg_dir):
    """Estimate always-on prompt cost of a Wayfinder Pi package without model calls."""
    import yaml

    pkg_dir = Path(pkg_dir).resolve()
    manifest = json.loads((pkg_dir / "package.json").read_text(encoding="utf-8"))
    skill_files = sorted((pkg_dir / "skills").rglob("SKILL.md"))

    skills_report = []
    total_chars = 0
    for skill_path in skill_files:
        front_raw, _ = split_front_matter(skill_path.read_text(encoding="utf-8"))
        meta = yaml.safe_load(front_raw) or {}
        if meta.get("disable-model-invocation") is True:
            continue
        name = str(meta.get("name") or skill_path.parent.name)
        desc = " ".join(str(meta.get("description") or "").split())
        xml_block = (
            f"  <skill>\n"
            f"    <name>{name}</name>\n"
            f"    <description>{desc}</description>\n"
            f"    <location>{skill_path}</location>\n"
            f"  </skill>\n"
        )
        chars = len(xml_block)
        total_chars += chars
        skills_report.append(
            {
                "name": name,
                "description_chars": len(desc),
                "xml_chars": chars,
                "approx_tokens": (chars + 3) // 4,
            }
        )

    return {
        "name": manifest.get("name", pkg_dir.name),
        "version": manifest.get("version", "0.0.0"),
        "skills": skills_report,
        "approx_tokens_total": (total_chars + 3) // 4,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run Wayfinder eval cases against Pi.")
    parser.add_argument("package_dir", nargs="?", default=str(DEFAULT_PACKAGE_DIR))
    parser.add_argument("--measure", action="store_true", help="measure always-on skill token cost and exit")
    parser.add_argument("--eval-dir", default="evals", help="subdirectory inside package_dir (default: evals)")
    parser.add_argument("--runs", type=int, default=1, help="runs per arm (default: 1)")
    parser.add_argument("--ablation", choices=["none", "both"], default="both")
    parser.add_argument("--case", action="append", dest="cases", help="run only matching case name(s)")
    parser.add_argument("--model", default=None, help="optional Pi --model pattern")
    parser.add_argument("--thinking", default=None, help="optional Pi --thinking level")
    parser.add_argument("--threshold", type=float, default=None, help="minimum 'With' score required to exit 0")
    parser.add_argument("--keep-temp", action="store_true", help="keep trace.jsonl directories")
    args = parser.parse_args(argv)

    pkg_dir = Path(args.package_dir).resolve()
    if args.measure:
        info = measure_package(pkg_dir)
        print(f"Package: {info['name']}@{info['version']}")
        for s in info["skills"]:
            print(
                f"  skill:{s['name']}  description={s['description_chars']}/1024 chars  "
                f"always-on≈{s['approx_tokens']} tokens"
            )
        print(f"Total always-on skill cost: ≈{info['approx_tokens_total']} tokens (deferred tools: 0 tokens)")
        return 0

    pi_bin = shutil.which("pi")
    if not pi_bin:
        print("pi_eval: `pi` executable not found on PATH", file=sys.stderr)
        return 2

    eval_root = pkg_dir / args.eval_dir
    case_dirs = sorted(p.parent for p in eval_root.glob("*/prompt.md"))
    if args.cases:
        wanted = set(args.cases)
        case_dirs = [d for d in case_dirs if d.name in wanted]
    if not case_dirs:
        print(f"pi_eval: no eval cases found in {eval_root}", file=sys.stderr)
        return 2

    with_baseline = args.ablation == "both"
    header = (
        f"{'Case':<28} {'With':>6} {'Without':>8} {'Delta':>7}  Route fired"
        if with_baseline
        else f"{'Case':<28} {'With':>6}  Route fired"
    )
    print(header)

    failed_threshold = False
    for case_dir in case_dirs:
        case = load_case(case_dir)
        pkg_paths = resolve_case_packages(case, pkg_dir)

        with_scores, fired_count = [], 0
        for _ in range(args.runs):
            trace, kept = run_once(
                pi_bin, case, pkg_paths, model=args.model, thinking=args.thinking, keep_temp=args.keep_temp
            )
            score, fired = evaluate_case_trace(case, trace, with_baseline=with_baseline)
            with_scores.append(score)
            fired_count += int(fired)
            if kept:
                print(f"  kept trace: {kept}", file=sys.stderr)

        mean_with = sum(with_scores) / len(with_scores)
        if args.threshold is not None and mean_with < args.threshold:
            failed_threshold = True

        if with_baseline:
            without_scores = []
            for _ in range(args.runs):
                trace, _ = run_once(
                    pi_bin, case, [], model=args.model, thinking=args.thinking, keep_temp=args.keep_temp
                )
                score, _ = evaluate_case_trace(case, trace, with_baseline=True)
                without_scores.append(score)
            mean_without = sum(without_scores) / len(without_scores)
            delta = mean_with - mean_without
            print(
                f"{case['name']:<28} {mean_with:>6.2f} {mean_without:>8.2f} {delta:>+7.2f}  {fired_count} of {args.runs}"
            )
        else:
            print(f"{case['name']:<28} {mean_with:>6.2f}  {fired_count} of {args.runs}")

    return 1 if failed_threshold else 0


if __name__ == "__main__":
    sys.exit(main())
