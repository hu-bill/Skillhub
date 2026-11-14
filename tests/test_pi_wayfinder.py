"""Unit tests for pi-package/bin/wayfinder and the Pi package layout."""

import contextlib
import datetime
import importlib.machinery
import importlib.util
import io
import json
import shutil
import subprocess
import tempfile
import types
import unittest
import unittest.mock
import urllib.error
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PI_PACKAGE = REPO / "pi-package"
_loader = importlib.machinery.SourceFileLoader("pi_wayfinder", str(PI_PACKAGE / "bin" / "wayfinder"))
_spec = importlib.util.spec_from_loader("pi_wayfinder", _loader)
pi_wayfinder = importlib.util.module_from_spec(_spec)
_loader.exec_module(pi_wayfinder)


def at(day, hour=12):
    return datetime.datetime(2026, 11, day, hour, 0, 0, tzinfo=datetime.timezone.utc)


def quiet(function, *args, **kwargs):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        result = function(*args, **kwargs)
    return result, out.getvalue(), err.getvalue()


class PiDataDirTests(unittest.TestCase):
    def test_default_data_dir_respects_pi_wayfinder_data_then_pi_agent_dir(self):
        self.assertEqual(
            pi_wayfinder.default_data_dir({"PI_WAYFINDER_DATA": "/tmp/custom-wf", "PI_CODING_AGENT_DIR": "/tmp/pi"}),
            "/tmp/custom-wf",
        )
        self.assertEqual(
            pi_wayfinder.default_data_dir({"PI_CODING_AGENT_DIR": "/tmp/pi-agent"}),
            "/tmp/pi-agent/data/wayfinder",
        )
        self.assertTrue(pi_wayfinder.default_data_dir({}).endswith("/.pi/agent/data/wayfinder"))

    def test_ledger_cli_uses_default_data_dir_when_data_flag_is_omitted(self):
        with tempfile.TemporaryDirectory() as tmp:
            with unittest.mock.patch.dict("os.environ", {"PI_WAYFINDER_DATA": tmp}, clear=False):
                code, out, _ = quiet(pi_wayfinder.main, ["ledger", "add", "recommended", "--card", "plan-large-feature"])
                self.assertEqual((code, out), (0, "logged recommended\n"))
                code, out, _ = quiet(pi_wayfinder.main, ["ledger", "show", "--card", "plan-large-feature"])
                self.assertEqual(code, 0)
                self.assertIn("recommended  plan-large-feature", out)


NPM_PAYLOAD = {
    "total": 13745,
    "objects": [
        {
            "package": {
                "name": "pi-subagents",
                "version": "0.88.1",
                "description": "Delegate work to child Pi sessions\nand background workers",
                "keywords": ["pi-package", "subagent"],
                "date": "2026-11-13T10:00:00.000Z",
                "publisher": {"username": "nicopreme"},
            },
            "score": {"final": 0.72},
        },
        {
            "package": {
                "name": "packet-helper",
                "version": "0.2.0",
                "description": "Inspect pcap traces",
                "keywords": ["pi-package", "bluetooth"],
                "date": "2026-10-01T00:00:00.000Z",
                "publisher": {"username": "alice"},
            },
            "score": {"final": 0.40},
        },
        {
            "package": {
                "name": "unrelated-theme",
                "version": "1.0.0",
                "description": "Solarized colors",
                "keywords": ["pi-package", "theme"],
                "date": "2026-09-01T00:00:00.000Z",
                "publisher": {"username": "bob"},
            },
            "score": {"final": 0.90},
        },
    ],
}


class PiCatalogTests(unittest.TestCase):
    def test_normalize_score_rank_and_format(self):
        entries = [pi_wayfinder.normalize_npm_object(o) for o in NPM_PAYLOAD["objects"]]
        self.assertEqual(pi_wayfinder.catalog_score(entries[1], ["packet", "bluetooth"]), 3 + 1)
        ranked = pi_wayfinder.catalog_rank(entries, ["packet", "pcap"], limit=5)
        self.assertEqual([e["name"] for e in ranked], ["packet-helper"])

        line = pi_wayfinder.catalog_line(entries[0])
        self.assertNotIn("\n", line)
        self.assertTrue(line.startswith("npm:pi-subagents@0.88.1 | publisher: nicopreme | updated: 2026-11-13 | "))

    def test_catalog_load_parses_npm_search_and_honors_offline(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps(NPM_PAYLOAD).encode("utf-8")

        def urlopen(req, timeout=0):
            self.assertIn("keywords%3Api-package", req.full_url)
            return FakeResponse()

        loaded = pi_wayfinder.catalog_load(["pcap"], urlopen=urlopen, env={})
        self.assertIsNotNone(loaded)
        entries, total = loaded
        self.assertEqual(total, 13745)
        self.assertEqual(len(entries), 3)

        self.assertIsNone(pi_wayfinder.catalog_load(["pcap"], urlopen=urlopen, env={"PI_OFFLINE": "1"}))

    def test_catalog_load_returns_none_on_network_or_json_errors(self):
        def net_err(req, timeout=0):
            raise urllib.error.URLError("offline")

        class BadJsonResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b"not json"

        self.assertIsNone(pi_wayfinder.catalog_load(["x"], urlopen=net_err, env={}))
        self.assertIsNone(pi_wayfinder.catalog_load(["x"], urlopen=lambda req, timeout=0: BadJsonResponse(), env={}))


class PiScoutTests(unittest.TestCase):
    def test_scout_builds_isolated_read_only_pi_command_with_recursion_guard(self):
        captured = {}

        def fake_run(cmd, **kwargs):
            captured["cmd"] = cmd
            captured["env"] = kwargs.get("env", {})
            return types.SimpleNamespace(returncode=0, stdout="UNVETTED live lookup, 2026-11-14\n")

        out = pi_wayfinder.scout_run(
            "Analyze Bluetooth packet captures",
            catalog="npm:packet-helper@0.2.0",
            installed="builtin:mcp",
            run=fake_run,
            which=lambda name: "/usr/bin/pi",
            env={},
        )
        self.assertEqual(out, "UNVETTED live lookup, 2026-11-14")
        self.assertIn("--no-session", captured["cmd"])
        self.assertIn("--no-skills", captured["cmd"])
        self.assertIn("edit,write", captured["cmd"])
        self.assertEqual(captured["env"].get("PI_WAYFINDER_SCOUT"), "1")

    def test_scout_returns_none_when_offline_or_pi_missing_or_nonzero(self):
        self.assertIsNone(pi_wayfinder.scout_run("task", which=lambda _: "/usr/bin/pi", env={"PI_OFFLINE": "true"}))
        self.assertIsNone(pi_wayfinder.scout_run("task", which=lambda _: None, env={}))
        self.assertIsNone(
            pi_wayfinder.scout_run(
                "task",
                run=lambda cmd, **kw: types.SimpleNamespace(returncode=1, stdout=""),
                which=lambda _: "/usr/bin/pi",
                env={},
            )
        )


class PiPackageManifestTests(unittest.TestCase):
    def test_package_manifest_follows_pi_package_rules(self):
        manifest = json.loads((PI_PACKAGE / "package.json").read_text(encoding="utf-8"))
        self.assertIn("pi-package", manifest["keywords"])
        self.assertNotIn("dependencies", manifest)
        for host_pkg in (
            "@earendil-works/pi-ai",
            "@earendil-works/pi-agent-core",
            "@earendil-works/pi-coding-agent",
            "@earendil-works/pi-tui",
            "typebox",
        ):
            self.assertIn(host_pkg, manifest["peerDependencies"])

    def test_pi_loads_extension_cleanly_when_pi_is_installed(self):
        pi_bin = shutil.which("pi")
        if not pi_bin:
            self.skipTest("pi CLI not installed")
        result = subprocess.run(
            [pi_bin, "-ne", "-ns", "-np", "-nc", "-e", str(PI_PACKAGE), "--help"],
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--no-wayfinder", result.stdout)


if __name__ == "__main__":
    import unittest.mock
    unittest.main()
