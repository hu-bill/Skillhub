"""Unit tests for tools/cards.py. Run: python3 -m unittest discover tests"""

import contextlib
import datetime
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("cards", REPO / "tools" / "cards.py")
cards = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cards)

TODAY = datetime.date(2026, 11, 13)

BODY = """
## Pattern

Text.

## Claude Code recipe

Text.

## Why skip the others

Text.

## Evidence

Text.
"""


def good_meta(**changes):
    meta = {
        "id": "sample-card",
        "kind": "method",
        "symptom": "Something keeps going wrong",
        "triggers": ["it went wrong again", "why does this keep happening"],
        "verdict": "built-in",
        "do": "Use the built-in feature",
        "alternative": None,
        "skip": [],
        "supersedes": [],
        "ring": "adopt",
        "trust": "official",
        "always_on_cost": "none",
        "executes": None,
        "install": None,
        "undo": None,
        "verified": datetime.date(2026, 11, 13),
        "ttl_days": 90,
        "sources": ["https://code.claude.com/docs/en/skills"],
    }
    meta.update(changes)
    return meta


def errors_for(meta, body=BODY, name="sample-card", line_count=40):
    return cards.validate(meta, body, name, line_count, TODAY)


def card_text(meta, body=BODY):
    import yaml

    return "---\n" + yaml.safe_dump(meta, sort_keys=False) + "---\n" + body


class ValidateTests(unittest.TestCase):
    def test_valid_card_has_no_errors(self):
        self.assertEqual(errors_for(good_meta()), [])

    def test_valid_install_card_has_no_errors(self):
        meta = good_meta(verdict="pick", trust="third-party", executes="An MCP server", install="npx x setup", undo="claude mcp remove x")
        self.assertEqual(errors_for(meta), [])

    def test_missing_field_is_reported(self):
        meta = good_meta()
        del meta["sources"]
        self.assertEqual(errors_for(meta), ["missing field: sources"])

    def test_bad_enum_is_reported(self):
        self.assertTrue(any(e.startswith("verdict:") for e in errors_for(good_meta(verdict="maybe"))))
        self.assertTrue(any(e.startswith("ring:") for e in errors_for(good_meta(ring="love"))))

    def test_id_must_match_file_name(self):
        self.assertTrue(any(e.startswith("id:") for e in errors_for(good_meta(), name="other-name")))

    def test_trigger_count_limits(self):
        self.assertTrue(any(e.startswith("triggers:") for e in errors_for(good_meta(triggers=["only one"]))))
        seven = [f"phrase {n}" for n in range(7)]
        self.assertTrue(any(e.startswith("triggers:") for e in errors_for(good_meta(triggers=seven))))

    def test_pipe_is_rejected_in_symptom_and_triggers(self):
        self.assertTrue(any("'|'" in e for e in errors_for(good_meta(symptom="a | b"))))
        self.assertTrue(any("'|'" in e for e in errors_for(good_meta(triggers=["fine", "a | b"]))))

    def test_sources_must_be_urls(self):
        self.assertTrue(any(e.startswith("sources:") for e in errors_for(good_meta(sources=[]))))
        self.assertTrue(any(e.startswith("sources:") for e in errors_for(good_meta(sources=["the docs"]))))

    def test_verified_must_be_a_past_or_present_date(self):
        future = good_meta(verified=datetime.date(2026, 11, 14))
        self.assertTrue(any("in the future" in e for e in errors_for(future)))
        self.assertTrue(any(e.startswith("verified:") for e in errors_for(good_meta(verified="last week"))))

    def test_ttl_must_be_a_positive_whole_number(self):
        for bad in (0, -5, "90", True):
            self.assertTrue(any(e.startswith("ttl_days:") for e in errors_for(good_meta(ttl_days=bad))), bad)

    def test_install_verdict_needs_install_fields(self):
        found = errors_for(good_meta(verdict="pick"))
        self.assertEqual(sum("required when the verdict is pick" in e for e in found), 3)

    def test_other_verdicts_must_leave_install_fields_null(self):
        found = errors_for(good_meta(install="npm install x"))
        self.assertEqual(found, ["install: must be null when the verdict is built-in"])

    def test_missing_heading_is_reported(self):
        body = BODY.replace("## Evidence", "## Proof")
        self.assertEqual(errors_for(good_meta(), body=body), ["body: missing the heading '## Evidence'"])

    def test_line_limit(self):
        self.assertEqual(errors_for(good_meta(), line_count=80), [])
        self.assertTrue(any("limit is 80" in e for e in errors_for(good_meta(), line_count=81)))


class FreshnessTests(unittest.TestCase):
    def test_expires_is_verified_plus_ttl(self):
        self.assertEqual(cards.expires(good_meta()), datetime.date(2027, 2, 11))
        self.assertEqual(cards.expires(good_meta(ttl_days=30)), datetime.date(2026, 12, 13))

    def test_state(self):
        meta = good_meta(ttl_days=30)  # review date 2026-12-13
        self.assertEqual(cards.state(meta, datetime.date(2026, 11, 28)), "fresh")
        self.assertEqual(cards.state(meta, datetime.date(2026, 11, 29)), "expiring")
        self.assertEqual(cards.state(meta, datetime.date(2026, 12, 13)), "expiring")
        self.assertEqual(cards.state(meta, datetime.date(2026, 12, 14)), "stale")


class IndexTests(unittest.TestCase):
    def test_render_index_is_sorted_and_formatted(self):
        second = good_meta(id="b-card", symptom="Second symptom.")
        first = good_meta(id="a-card", verdict="pick", ttl_days=30)
        self.assertEqual(
            cards.render_index([second, first]),
            cards.INDEX_HEADER
            + '| a-card | method | Something keeps going wrong. "it went wrong again"; "why does this keep happening" | pick | 2026-12-13 |\n'
            + '| b-card | method | Second symptom. "it went wrong again"; "why does this keep happening" | built-in | 2027-02-11 |\n',
        )

    def test_split_card_rejects_missing_or_open_front_matter(self):
        with self.assertRaises(ValueError):
            cards.split_card("# No front matter\n")
        with self.assertRaises(ValueError):
            cards.split_card("---\nid: x\n")


class CommandTests(unittest.TestCase):
    def run_quiet(self, command, directory):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = command(directory, TODAY)
        return code, out.getvalue()

    def test_check_fails_until_the_index_is_written(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "sample-card.md").write_text(card_text(good_meta()))
            code, output = self.run_quiet(cards.cmd_check, directory)
            self.assertEqual(code, 1)
            self.assertIn("out of date", output)
            self.assertEqual(self.run_quiet(cards.cmd_index, directory)[0], 0)
            code, output = self.run_quiet(cards.cmd_check, directory)
            self.assertEqual(code, 0)
            self.assertIn("1 cards", output)

    def test_check_reports_a_broken_card_and_index_refuses_to_write(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "sample-card.md").write_text(card_text(good_meta(verdict="maybe")))
            Path(directory, "no-front-matter.md").write_text("# Just a heading\n")
            code, output = self.run_quiet(cards.cmd_check, directory)
            self.assertEqual(code, 1)
            self.assertIn("ERROR sample-card.md: verdict", output)
            self.assertIn("ERROR no-front-matter.md: front matter", output)
            self.assertEqual(self.run_quiet(cards.cmd_index, directory)[0], 1)
            self.assertFalse(Path(directory, cards.INDEX_NAME).exists())

    def test_check_warns_about_stale_cards_without_failing(self):
        with tempfile.TemporaryDirectory() as directory:
            old = good_meta(verified=datetime.date(2026, 1, 1), ttl_days=30)
            Path(directory, "sample-card.md").write_text(card_text(old))
            self.run_quiet(cards.cmd_index, directory)
            code, output = self.run_quiet(cards.cmd_check, directory)
            self.assertEqual(code, 0)
            self.assertIn("WARN  sample-card: stale", output)

    def test_the_shipped_cards_pass(self):
        code, output = self.run_quiet(cards.cmd_check, cards.CARDS_DIR)
        self.assertEqual(code, 0, output)


if __name__ == "__main__":
    unittest.main()
