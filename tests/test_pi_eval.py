"""Unit tests for tools/pi_eval.py and shipped Pi eval cases."""

import importlib.util
import json
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("pi_eval", REPO / "tools" / "pi_eval.py")
pi_eval = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pi_eval)


class PiEvalTests(unittest.TestCase):
    def test_parse_pi_json_stream_handles_strict_lf_and_unicode_separators(self):
        # \u2028 inside JSON text must not split the JSONL record (docs/json.md).
        events = [
            json.dumps({"type": "session", "version": 3, "id": "abc"}),
            json.dumps(
                {
                    "type": "tool_execution_start",
                    "toolCallId": "c1",
                    "toolName": "read",
                    "args": {"path": "/pkg/skills/route/SKILL.md"},
                }
            ),
            json.dumps(
                {
                    "type": "message_end",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "Wayfinder: Use /new\u2028(card long-sessions-degrade, verified 2026-11-14)."}
                        ],
                    },
                }
            ),
        ]
        raw = "\r\n".join(events) + "\n"
        trace = pi_eval.parse_pi_json_stream(raw)
        self.assertEqual(len(trace["tool_calls"]), 1)
        self.assertEqual(trace["tool_calls"][0]["toolName"], "read")
        self.assertIn("verified 2026-11-14", trace["final_text"])

    def test_evaluate_case_trace_scores_graders_and_indicator(self):
        case = {
            "graders": [
                {"type": "tool_used", "tool": "read", "input_match": r"skills/route/SKILL\.md"},
                {"type": "regex", "pattern": r"\bREA\b"},
                {"type": "regex", "pattern": r"verified \d{4}-\d{2}-\d{2}"},
            ]
        }
        trace = {
            "tool_calls": [{"toolName": "read", "args": {"path": "/x/skills/route/SKILL.md"}}],
            "final_text": "Wayfinder: Use REA (card reverse-engineering, verified 2026-11-14).",
        }
        score, fired = pi_eval.evaluate_case_trace(case, trace, with_baseline=True)
        self.assertEqual((score, fired), (1.0, True))

        bare_trace = {"tool_calls": [], "final_text": "Try strings or Ghidra."}
        bare_score, bare_fired = pi_eval.evaluate_case_trace(case, bare_trace, with_baseline=True)
        self.assertEqual((bare_score, bare_fired), (0.0, False))

    def test_never_fires_grader_scores_both_arms(self):
        case = {
            "graders": [
                {
                    "type": "tool_used",
                    "tool": "read",
                    "input_match": r"skills/route/SKILL\.md",
                    "min": 0,
                    "max": 0,
                    "arm": "both",
                }
            ]
        }
        silent = {"tool_calls": [], "final_text": "The quick brown fox."}
        self.assertEqual(pi_eval.evaluate_case_trace(case, silent, with_baseline=True), (1.0, False))

        misfired = {
            "tool_calls": [{"toolName": "read", "args": {"path": "/x/skills/route/SKILL.md"}}],
            "final_text": "The quick brown fox.",
        }
        self.assertEqual(pi_eval.evaluate_case_trace(case, misfired, with_baseline=True), (0.0, True))

    def test_measure_package_checks_agent_skills_description_limit(self):
        info = pi_eval.measure_package(REPO / "pi-package")
        self.assertEqual(len(info["skills"]), 1)
        route = info["skills"][0]
        self.assertEqual(route["name"], "route")
        self.assertLessEqual(route["description_chars"], 1024)
        self.assertLessEqual(info["approx_tokens_total"], 300)

    def test_all_shipped_pi_eval_cases_load_cleanly(self):
        for subdir in ("evals", "evals-live"):
            root = REPO / "pi-package" / subdir
            case_dirs = sorted(p.parent for p in root.glob("*/prompt.md"))
            self.assertGreater(len(case_dirs), 0, subdir)
            for cdir in case_dirs:
                case = pi_eval.load_case(cdir)
                self.assertTrue(case["prompt"], cdir.name)
                self.assertGreater(len(case["graders"]), 0, cdir.name)


if __name__ == "__main__":
    unittest.main()
