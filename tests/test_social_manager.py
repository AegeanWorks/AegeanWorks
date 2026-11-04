"""Tests for the AegeanWorks social manager (tools/social/).

Every bar is proved by a blocking test: off-topic, unverified evidence,
provenance-free visuals, chart crimes, unapproved publishes, spam, secrets.
Stdlib only, tempdir state, no network, no sleeps.
"""

import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from social import disclosure, draft, evidence, media_capture, media_chart
from social import media_compose, provenance, profile, publish, queue, secrets
from social import spam_guard, topic_gate, x_client

DATA_FILE = "docs/live.json"
COMMIT = "ea26791d52722e78af0a87b25d3268e72d52836"
RUN = "run-2026-11-03-test"
DATE = "2026-11-03"
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x02\x00\x00\x00\x02"
    b"\x08\x02\x00\x00\x00\xfd\xd4\x9as\x00\x00\x00\x1dIDATx\x9cc\xf8\x0f"
    b"\x00\x01\x01\x01\x00\x1b\xb4\x8b\x9e\x00\x00\x00\x00IEND\xaeB`\x82"
)


def visual_fixture(**over):
    base = {"digest": "sha256:" + "a" * 64, "run": RUN, "commit": COMMIT, "data_file": DATA_FILE}
    base.update(over)
    return base


def draft_record(state, text="AIKit ships a new ledger view", repo="AIKit"):
    return draft.build_post(
        repo=repo,
        text=text,
        kind="screenshot",
        commit=COMMIT,
        data_file=DATA_FILE,
        suite_ok=True,
        visual=visual_fixture(),
        run_id=RUN,
        date=DATE,
        state_dir=state,
    )


class DisclosureTests(unittest.TestCase):
    BANNED = ("human-approved", "human approval", "automated draft", "automated posts are marked",
              "run by ai", "operated by ai", "🤖")

    def test_copy_pinned(self):
        data = disclosure.load_disclosure()
        self.assertIn("written by AI", data["bio"])
        self.assertIn("written by AI", data["site_notice"])
        self.assertIn("Made by AI", data["infographic_ai_mark"])
        self.assertIn("Made by AI", data["infographic_ai_mark"])

    def test_no_boilerplate_in_post_facing_copy(self):
        data = disclosure.load_disclosure()
        for field in ("bio", "site_notice", "post_marker"):
            for banned in self.BANNED:
                self.assertNotIn(banned, data[field].lower(), f"{field} contains {banned!r}")

    def test_built_draft_carries_no_boilerplate(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft.build_post(
                "AIKit", "AIKit ships a new ledger view", "notice", COMMIT, DATA_FILE,
                True, None, RUN, DATE, state,
            )
            for banned in self.BANNED:
                self.assertNotIn(banned, record["draft"]["text"].lower())

    def test_marker_empty_is_identity(self):
        self.assertEqual(disclosure.post_marker(), "")
        self.assertEqual(disclosure.apply_marker("hello"), "hello")
        self.assertTrue(disclosure.has_marker("anything"))


class TopicGateTests(unittest.TestCase):
    def test_allowlist_matches_public_repos(self):
        works = topic_gate.load_works()
        src = (ROOT / "tests" / "test_profile.py").read_text(encoding="utf-8")
        public = set(re.search(r"PUBLIC_REPOS = \{(.*?)\}", src, re.S).group(1).replace('"', "").replace(",", " ").split())
        self.assertEqual(works, {name.lower() for name in public})

    def test_off_topic_blocked(self):
        self.assertTrue(topic_gate.is_on_topic("aikit"))
        self.assertFalse(topic_gate.is_on_topic("crypto giveaway"))
        with self.assertRaises(topic_gate.OffTopicError):
            topic_gate.require_on_topic("crypto giveaway")

    def test_draft_blocks_off_topic(self):
        with tempfile.TemporaryDirectory() as state:
            with self.assertRaises(topic_gate.OffTopicError):
                draft_record(state, repo="NotAProject")


class EvidenceTests(unittest.TestCase):
    def test_bad_commit_blocked(self):
        with self.assertRaises(evidence.UnverifiedError):
            evidence.require_evidence("AIKit", "zzz", DATA_FILE, True)

    def test_missing_data_file_blocked(self):
        with self.assertRaises(evidence.UnverifiedError):
            evidence.require_evidence("AIKit", COMMIT, "docs/nope.json", True)

    def test_red_suite_blocked(self):
        with self.assertRaises(evidence.UnverifiedError):
            evidence.require_evidence("AIKit", COMMIT, DATA_FILE, False)


class MediaPipelineTests(unittest.TestCase):
    def test_capture_records_provenance(self):
        entry = media_capture.record_capture(TINY_PNG, "AIKit", COMMIT)
        self.assertEqual(entry["digest"], media_capture.digest(TINY_PNG))
        self.assertEqual((entry["width"], entry["height"]), (2, 2))

    def test_recycled_screenshot_blocked(self):
        digest_value = media_capture.digest(TINY_PNG)
        with self.assertRaises(media_capture.CaptureError):
            media_capture.record_capture(TINY_PNG, "AIKit", "b" * 40, known_digests={COMMIT: digest_value})

    def test_capture_bad_commit_blocked(self):
        with self.assertRaises(media_capture.CaptureError):
            media_capture.record_capture(TINY_PNG, "AIKit", "nope")

    def test_chart_requires_units(self):
        with self.assertRaises(media_chart.ChartError):
            media_chart.render_svg("t", "", [{"label": "a", "value": 1}], RUN, COMMIT)

    def test_chart_blocks_cherry_pick(self):
        with tempfile.TemporaryDirectory() as temp:
            series = Path(temp) / "series.json"
            series.write_text(json.dumps({"rows": [{"label": "a", "value": 1}, {"label": "b", "value": 2}]}), encoding="utf-8")
            with self.assertRaises(media_chart.ChartError):
                media_chart.load_series(str(series), [{"label": "a", "value": 1}])

    def test_chart_blocks_truncated_axis(self):
        rows = [{"label": "a", "value": 95}, {"label": "b", "value": 100}]
        with self.assertRaises(media_chart.ChartError):
            media_chart.render_svg("t", "ms", rows, RUN, COMMIT)
        svg = media_chart.render_svg("t", "ms", rows, RUN, COMMIT, broken_axis=True)
        self.assertIn("broken", svg)
        self.assertIn(COMMIT, svg)

    def test_chart_deterministic(self):
        rows = [{"label": "a", "value": 1}, {"label": "b", "value": 3}]
        first = media_chart.render_svg("t", "tests", rows, RUN, COMMIT)
        second = media_chart.render_svg("t", "tests", rows, RUN, COMMIT)
        self.assertEqual(media_chart.svg_digest(first), media_chart.svg_digest(second))

    def test_compose_burns_provenance_and_ai_mark(self):
        svg = media_compose.compose_svg("AIKit week", ["95 tests green"], RUN, COMMIT, DATA_FILE, DATE, disclosure.ai_mark())
        for token in (RUN, COMMIT, DATA_FILE, DATE, "Made by AI"):
            self.assertIn(token, svg)

    def test_compose_blocks_missing_provenance(self):
        with self.assertRaises(ValueError):
            media_compose.compose_svg("t", ["x"], "", COMMIT, DATA_FILE, DATE, disclosure.ai_mark())

    def test_provenance_verify(self):
        stamp = provenance.stamp(RUN, COMMIT, DATA_FILE, DATE)
        self.assertIn(COMMIT, stamp)
        provenance.verify_digest(b"abc", "sha256:" + __import__("hashlib").sha256(b"abc").hexdigest())
        with self.assertRaises(provenance.ProvenanceError):
            provenance.verify_digest(b"abc", "sha256:" + "0" * 64)
        with self.assertRaises(provenance.ProvenanceError):
            provenance.stamp("", COMMIT, DATA_FILE, DATE)


class DraftQueueTests(unittest.TestCase):
    def test_text_only_visual_subject_blocked(self):
        with tempfile.TemporaryDirectory() as state:
            with self.assertRaises(draft.DraftError):
                draft.build_post("AIKit", "numbers!", "chart", COMMIT, DATA_FILE, True, None, RUN, DATE, state)

    def test_provenance_free_visual_blocked(self):
        with tempfile.TemporaryDirectory() as state:
            with self.assertRaises(draft.DraftError):
                draft.build_post("AIKit", "look", "screenshot", COMMIT, DATA_FILE, True, {"digest": ""}, RUN, DATE, state)

    def test_draft_unapproved_by_default(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft_record(state)
            self.assertFalse(record["approved"])
            self.assertTrue(disclosure.has_marker(record["draft"]["text"]))

    def test_publish_blocks_unapproved(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft_record(state)
            with self.assertRaises(queue.QueueError):
                publish.publish(record["id"], state, x_client.MockTransport())

    def test_publish_mock_roundtrip_and_idempotency(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft_record(state)
            queue.approve(record["id"], "owner", state)
            transport = x_client.MockTransport()
            first = publish.publish(record["id"], state, transport)
            self.assertFalse(first["live"])
            second = publish.publish(record["id"], state, transport)
            self.assertEqual(first["idempotency_key"], second["idempotency_key"])
            self.assertEqual(len(transport.sent), 1)

    def test_live_blocked_without_flag(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft_record(state)
            queue.approve(record["id"], "owner", state)
            live = x_client.LiveTransport({})
            with self.assertRaises((publish.PublishError, RuntimeError)):
                publish.publish(record["id"], state, live)

    def test_rephrased_repost_blocked(self):
        with tempfile.TemporaryDirectory() as state:
            first = "AIKit ships a new ledger view with crash-safe writes"
            record = draft_record(state, text=first)
            queue.approve(record["id"], "owner", state)
            shipped = record["draft"]["text"]
            with self.assertRaises(draft.DraftError):
                draft.build_post("AIKit", first + " today", "screenshot", COMMIT, DATA_FILE, True,
                                 visual_fixture(), RUN, DATE, state, existing_texts=[shipped])

    def test_exact_duplicate_blocked(self):
        text = "AIKit ships a new ledger view"
        self.assertEqual(spam_guard.content_hash(text), spam_guard.content_hash(text + "\n\n" + disclosure.post_marker()))
        with tempfile.TemporaryDirectory() as state:
            record = draft_record(state, text=text)
            with self.assertRaises(draft.DraftError):
                draft_record(state, text=text + " ")
                draft.build_post("AIKit", text, "screenshot", COMMIT, DATA_FILE, True,
                                 visual_fixture(), RUN, DATE, state, existing_texts=[record["draft"]["text"]])


class CadenceTests(unittest.TestCase):
    def test_caps_enforced(self):
        ok, _ = spam_guard.cadence_ok([], "2026-11-03T12:00:00+00:00")
        self.assertTrue(ok)
        ok, why = spam_guard.cadence_ok(
            ["2026-11-03T08:00:00+00:00", "2026-11-03T09:00:00+00:00", "2026-11-03T10:00:00+00:00"],
            "2026-11-03T12:00:00+00:00")
        self.assertFalse(ok)
        self.assertIn("daily", why)
        ok, why = spam_guard.cadence_ok([], "2026-11-03T03:00:00+00:00")
        self.assertFalse(ok)
        self.assertIn("quiet", why)
        ok, why = spam_guard.cadence_ok(["2026-11-03T11:30:00+00:00"], "2026-11-03T12:00:00+00:00")
        self.assertFalse(ok)
        self.assertIn("gap", why)

    def test_three_daily_slots_pass(self):
        day = "2026-11-03"
        ok, _ = spam_guard.cadence_ok([], f"{day}T12:00:00+03:00")
        self.assertTrue(ok)
        ok, _ = spam_guard.cadence_ok([f"{day}T12:00:00+03:00"], f"{day}T17:00:00+03:00")
        self.assertTrue(ok)
        ok, _ = spam_guard.cadence_ok(
            [f"{day}T12:00:00+03:00", f"{day}T17:00:00+03:00"], f"{day}T21:00:00+03:00")
        self.assertTrue(ok)
        ok, why = spam_guard.cadence_ok(
            [f"{day}T12:00:00+03:00", f"{day}T17:00:00+03:00", f"{day}T21:00:00+03:00"],
            f"{day}T22:00:00+03:00")
        self.assertFalse(ok)
        self.assertIn("daily", why)


class ProfileTests(unittest.TestCase):
    def test_profile_change_needs_approval(self):
        with tempfile.TemporaryDirectory() as state:
            record = queue.add_draft({"change": "bio"}, state)
            with self.assertRaises(queue.QueueError):
                profile.apply_profile_change("bio", record)
            queue.approve(record["id"], "owner", state)
            applied = profile.apply_profile_change("bio", queue.get(record["id"], state))
            self.assertIn("AI", applied["bio"])


class ContextTests(unittest.TestCase):
    def test_context_from_repo_sources(self):
        from social import context

        ctx = context.load_context("AIKit")
        self.assertEqual(ctx["repo"], "AIKit")
        self.assertIn("name", ctx["meta"])

    def test_context_off_topic_blocked(self):
        from social import context

        with self.assertRaises(topic_gate.OffTopicError):
            context.load_context("NotAProject")


class SecretBoundaryTests(unittest.TestCase):
    CREDENTIAL_VALUE = [
        re.compile(r"(?i)(api[_-]?key|api[_-]?secret|access[_-]?token)\s*[:=]\s*['\"][A-Za-z0-9_\-+/=]{8,}['\"]"),
        re.compile(r"\bsk-[A-Za-z0-9]{8,}\b"),
        re.compile(r"\bghp_[A-Za-z0-9]{8,}\b"),
        re.compile(r"\bAKIA[0-9A-Z]{8,}\b"),
        re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{8,}\b"),
    ]

    def test_no_credential_values_in_module_or_tests(self):
        roots = [ROOT / "tools" / "social", Path(__file__)]
        hits = []
        for root in roots:
            files = [root] if root.is_file() else list(root.rglob("*.py")) + list(root.rglob("*.json"))
            for path in files:
                if "state" in path.parts:
                    continue
                text = path.read_text(encoding="utf-8")
                for pattern in self.CREDENTIAL_VALUE:
                    for match in pattern.finditer(text):
                        hits.append(f"{path.name}: {match.group(0)[:24]}…")
        self.assertEqual(hits, [])

    def test_credentials_env_only(self):
        backup = {key: os.environ.pop(key, None) for key in secrets.KEYS}
        try:
            with self.assertRaises(secrets.MissingCredentialsError):
                secrets.load_x_credentials()
            os.environ.update({key: "TEST_ONLY_PLACEHOLDER" for key in secrets.KEYS})
            creds = secrets.load_x_credentials()
            self.assertEqual(set(creds), set(secrets.KEYS))
        finally:
            for key, value in backup.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ.update({key: value})  # hygiene: allow test restores the prior environment value
            for key in secrets.KEYS:
                if backup[key] is None:
                    os.environ.pop(key, None)


class SiteDisclosureTests(unittest.TestCase):
    PAGES = ("index.html", "project.html", "verify.html", "play.html", "security.html", "privacy.html", "accessibility.html")

    def test_site_notice_on_every_shared_footer(self):
        notice = disclosure.site_notice()
        for page in self.PAGES:
            with self.subTest(page=page):
                self.assertIn(notice, (ROOT / "docs" / page).read_text(encoding="utf-8"))

    def test_privacy_names_ai_operation(self):
        privacy = (ROOT / "docs" / "privacy.html").read_text(encoding="utf-8")
        self.assertIn("written by AI", privacy)
        self.assertIn("No X credential is stored", privacy)


if __name__ == "__main__":
    unittest.main()
