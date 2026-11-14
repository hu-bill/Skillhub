"""Unit tests for plugin/bin/wayfinder. Run: python3 -m unittest discover tests"""

import contextlib
import datetime
import importlib.machinery
import importlib.util
import io
import json
import subprocess
import tempfile
import types
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
_loader = importlib.machinery.SourceFileLoader("wayfinder", str(REPO / "plugin" / "bin" / "wayfinder"))
_spec = importlib.util.spec_from_loader("wayfinder", _loader)
wayfinder = importlib.util.module_from_spec(_spec)
_loader.exec_module(wayfinder)


def at(day, hour=12):
    return datetime.datetime(2026, 11, day, hour, 0, 0, tzinfo=datetime.timezone.utc)


def quiet(function, *args, **kwargs):
    """Call function with stdout and stderr captured. Return (result, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        result = function(*args, **kwargs)
    return result, out.getvalue(), err.getvalue()


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.data = Path(self._tmp.name) / "data"

    def add(self, event, **kwargs):
        kwargs.setdefault("project", "/work/app")
        return quiet(wayfinder.ledger_add, self.data, event, **kwargs)[0]

    def test_add_creates_the_directory_and_writes_one_json_line(self):
        self.assertTrue(self.add("recommended", card="reverse-engineering", now=at(13, 19)))
        lines = (self.data / "ledger.jsonl").read_text().splitlines()
        self.assertEqual(
            [json.loads(line) for line in lines],
            [{"ts": "2026-11-13T19:00:00Z", "event": "recommended", "card": "reverse-engineering", "project": "/work/app"}],
        )

    def test_show_is_newest_first_and_filters(self):
        self.add("recommended", card="a", now=at(10))
        self.add("declined", card="a", reason="prefer my own setup", now=at(11))
        self.add("recommended", card="b", now=at(12))
        self.assertEqual([e["ts"][:10] for e in wayfinder.ledger_show(self.data)], ["2026-11-12", "2026-11-11", "2026-11-10"])
        self.assertEqual([e["event"] for e in wayfinder.ledger_show(self.data, card="a")], ["declined", "recommended"])
        self.assertEqual([e["card"] for e in wayfinder.ledger_show(self.data, since="2026-11-11")], ["b", "a"])
        self.assertEqual(len(wayfinder.ledger_show(self.data, limit=2)), 2)

    def test_format_entry(self):
        self.add("declined", card="a", reason="prefer my own setup", now=at(11))
        self.assertEqual(
            wayfinder.format_entry(wayfinder.ledger_show(self.data)[0]),
            "2026-11-11  declined  a  reason: prefer my own setup",
        )

    def test_misses_are_grouped_and_counted(self):
        self.add("miss", query="Analyze a  packet capture", now=at(10))
        self.add("miss", query="analyze a packet capture", now=at(12))
        self.add("miss", query="tune a Postgres query", now=at(11))
        self.add("recommended", card="a", now=at(12))
        self.assertEqual(
            wayfinder.ledger_misses(self.data),
            [("analyze a packet capture", 2, "2026-11-12"), ("tune a postgres query", 1, "2026-11-11")],
        )

    def test_events_missing_their_required_field_are_not_logged(self):
        self.assertFalse(self.add("miss"))
        self.assertFalse(self.add("recommended"))
        self.assertFalse((self.data / "ledger.jsonl").exists())

    def test_empty_data_directory_is_not_logged(self):
        result, _, err = quiet(wayfinder.ledger_add, "", "recommended", card="a")
        self.assertFalse(result)
        self.assertIn("no data directory", err)

    def test_a_failed_write_returns_false_and_does_not_raise(self):
        blocker = Path(self._tmp.name) / "a-file"
        blocker.write_text("not a directory")
        result, _, err = quiet(wayfinder.ledger_add, blocker / "data", "recommended", card="a")
        self.assertFalse(result)
        self.assertIn("ledger not written", err)

    def test_unreadable_lines_are_skipped(self):
        self.add("recommended", card="a", now=at(10))
        with (self.data / "ledger.jsonl").open("a") as handle:
            handle.write("not json\n[1, 2]\n{\"event\": \"miss\"}\n")
        self.assertEqual(len(wayfinder.ledger_read(self.data)), 1)

    def test_reading_a_missing_ledger_gives_nothing(self):
        self.assertEqual(wayfinder.ledger_read(self.data), [])
        self.assertEqual(wayfinder.ledger_misses(self.data), [])

    def test_main_exits_zero_when_the_write_fails(self):
        blocker = Path(self._tmp.name) / "a-file"
        blocker.write_text("not a directory")
        argv = ["ledger", "add", "recommended", "--data", str(blocker / "data"), "--card", "a"]
        code, out, _ = quiet(wayfinder.main, argv)
        self.assertEqual(code, 0)
        self.assertEqual(out, "")

    def test_main_add_then_show(self):
        code, out, _ = quiet(wayfinder.main, ["ledger", "add", "miss", "--data", str(self.data), "--query", "read a pcap"])
        self.assertEqual((code, out), (0, "logged miss\n"))
        code, out, _ = quiet(wayfinder.main, ["ledger", "misses", "--data", str(self.data)])
        self.assertEqual(code, 0)
        self.assertIn("1x  read a pcap", out)
        code, out, _ = quiet(wayfinder.main, ["ledger", "show", "--data", str(self.data), "--card", "none"])
        self.assertEqual((code, out), (0, "no ledger entries\n"))


CATALOG = [
    {"pluginId": "playwright@official", "name": "playwright", "description": "Browser automation and testing", "installCount": 900},
    {"pluginId": "browser-notes@dir", "name": "browser-notes", "description": "Take notes", "installCount": None},
    {"pluginId": "qa-kit@dir", "name": "qa-kit", "description": "Testing helpers for a browser\nand more", "installCount": 5},
    {"pluginId": "invoices@dir", "name": "invoices", "description": "Make invoices", "installCount": 70},
]


class CatalogTests(unittest.TestCase):
    def test_score_weights_name_over_description(self):
        self.assertEqual(wayfinder.catalog_score(CATALOG[0], ["browser", "playwright"]), 1 + 3)
        self.assertEqual(wayfinder.catalog_score(CATALOG[1], ["browser"]), 3)
        self.assertEqual(wayfinder.catalog_score(CATALOG[3], ["browser"]), 0)

    def test_rank_orders_by_score_then_installs_and_drops_non_matches(self):
        ranked = wayfinder.catalog_rank(CATALOG, ["Browser", "testing"], limit=10)
        self.assertEqual([e["name"] for e in ranked], ["browser-notes", "playwright", "qa-kit"])
        self.assertEqual(len(wayfinder.catalog_rank(CATALOG, ["browser"], limit=1)), 1)
        self.assertEqual(wayfinder.catalog_rank(CATALOG, ["kubernetes"], limit=10), [])

    def test_line_is_one_line_and_truncated(self):
        long_entry = {"pluginId": "x@y", "description": "word " * 100, "installCount": None}
        line = wayfinder.catalog_line(long_entry)
        self.assertTrue(line.startswith("x@y | installs: unknown | word word"))
        self.assertEqual(len(line.split(" | ")[2]), 140)
        self.assertNotIn("\n", wayfinder.catalog_line(CATALOG[2]))

    def test_load_reads_the_available_list(self):
        def run(command, **kwargs):
            self.assertEqual(command, wayfinder.CATALOG_COMMAND)
            return types.SimpleNamespace(stdout=json.dumps({"installed": [], "available": CATALOG}))

        self.assertEqual(wayfinder.catalog_load(run), CATALOG)

    def test_load_returns_none_when_the_catalog_cannot_be_read(self):
        def missing(command, **kwargs):
            raise FileNotFoundError("claude")

        def slow(command, **kwargs):
            raise subprocess.TimeoutExpired(command, 20)

        def garbage(command, **kwargs):
            return types.SimpleNamespace(stdout="not json")

        def wrong_shape(command, **kwargs):
            return types.SimpleNamespace(stdout=json.dumps({"available": "nope"}))

        for run in (missing, slow, garbage, wrong_shape):
            self.assertIsNone(wayfinder.catalog_load(run), run.__name__)


if __name__ == "__main__":
    unittest.main()
