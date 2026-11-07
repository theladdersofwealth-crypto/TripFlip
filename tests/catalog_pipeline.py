"""Meaningful regression tests for evidence, licensing, review and import gates."""
import copy
import csv
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/catalog"))
import pipeline as catalog


def fixture(record_id="test-place", kind="place", region_id="test-region"):
    src = catalog.source("test-owned", "manual", license="OWNED", checked_at="2026-11-03", note="Test fixture only: original test data, not a real travel recommendation.")
    return catalog.record(record_id, kind, region_id, {
        "name": catalog.field("TEST ONLY", src["id"], "verified"),
        "lat": catalog.field(None, src["id"]),
        "lon": catalog.field(None, src["id"]),
    }, [src])


def empty_raw():
    return {"schemaVersion": 1, "files": {}, "modules": {
        "worldV1": {"WORLD_REGIONS": [], "WORLD_PLACES": []},
        "regionsV1": {"REGIONS_V1": [], "PLACES_V1": []},
        "placeAttrs": {"PLACE_ATTRS": {}}, "placeFit": {"PLACE_FIT": {}},
        "worldHotels": {"HOTELS": {}},
        "nhaTrang": {"NHA_TRANG_PLACES": [], "NHA_TRANG_RESTAURANTS": []},
    }}


def approval(row):
    return {"state": "approved", "reviewer": "test-fixture-reviewer", "reviewedAt": "2026-11-03", "recordHash": catalog.digest(row)}


class CatalogueValidation(unittest.TestCase):
    def codes(self, row):
        return {error["code"] for error in catalog.validate_record(row, {"test-region"})}

    def test_unknown_is_null_and_explicit_false_is_not_unknown(self):
        row = fixture()
        self.assertEqual(self.codes(row), set())
        row["fields"]["stroller"] = catalog.field(False, "test-owned", "verified")
        self.assertEqual(row["fields"]["stroller"]["value"], False)
        self.assertEqual(self.codes(row), set())
        row["fields"]["stroller"]["status"] = "unknown"
        self.assertIn("UNKNOWN_NULL_MISMATCH", self.codes(row))

    def test_coordinates_and_references_are_validated(self):
        row = fixture()
        row["fields"]["lat"] = catalog.field(91, "test-owned", "verified")
        row["fields"]["lon"] = catalog.field(180, "test-owned", "verified")
        self.assertIn("OUT_OF_RANGE", self.codes(row))
        row["regionId"] = "missing-region"
        self.assertIn("UNKNOWN_REGION", self.codes(row))

    def test_malformed_field_is_quarantinable_without_crashing(self):
        row = fixture()
        row["fields"]["lat"] = 100
        self.assertIn("INVALID_FIELD", self.codes(row))

    def test_ai_cannot_claim_verified_or_hard_exclusion(self):
        row = fixture()
        row["sources"][0]["kind"] = "ai"
        self.assertIn("VERIFICATION_EVIDENCE_REQUIRED", self.codes(row))
        row["fields"]["name"]["status"] = "estimated"
        row["fields"]["companionFit"] = catalog.field([0, 0, 0], "test-owned", "estimated")
        self.assertEqual(self.codes(row), set())
        # A zero remains a score; it must not acquire an access-prohibition flag.
        self.assertEqual(row["fields"]["companionFit"]["value"], [0, 0, 0])
        row["fields"]["companionFit"]["useAsHardConstraint"] = True
        self.assertIn("UNVERIFIED_HARD_CONSTRAINT", self.codes(row))

    def test_verified_requires_actual_evidence_metadata(self):
        row = fixture()
        row["sources"][0]["checkedAt"] = None
        self.assertIn("VERIFICATION_EVIDENCE_REQUIRED", self.codes(row))

    def test_source_links_cannot_use_executable_schemes(self):
        row = fixture()
        row["sources"][0]["url"] = "javascript:alert(1)"
        self.assertIn("INVALID_SOURCE_URL", self.codes(row))

    def test_osm_license_and_attribution_are_not_optional(self):
        row = fixture()
        row["sources"][0]["kind"] = "osm"
        self.assertIn("OSM_LICENSE_REQUIRED", self.codes(row))
        row["sources"][0]["license"] = "ODbL-1.0"
        self.assertEqual(self.codes(row), set())
        self.assertIn("ATTRIBUTION_REQUIRED", catalog.publication_holds(row, approval(row)))

    def test_demo_and_unlicensed_data_never_publish_even_with_approval(self):
        row = fixture()
        row["demo"] = True
        self.assertIn("DEMO_NOT_PUBLISHABLE", catalog.publication_holds(row, approval(row)))
        row["demo"] = False
        row["sources"][0]["license"] = None
        self.assertIn("LICENSE_REVIEW_REQUIRED", catalog.publication_holds(row, approval(row)))

    def test_approval_is_pinned_to_record_version(self):
        row = fixture()
        reviewed = approval(row)
        self.assertEqual(catalog.publication_holds(row, reviewed), [])
        row["fields"]["name"]["value"] = "CHANGED TEST NAME"
        self.assertIn("APPROVAL_STALE", catalog.publication_holds(row, reviewed))

    def test_exact_duplicates_are_idempotent_but_conflicts_are_quarantined(self):
        a = fixture()
        good, bad = catalog.merge_records([a, copy.deepcopy(a)])
        self.assertEqual((len(good), len(bad)), (1, 0))
        b = copy.deepcopy(a)
        b["fields"]["name"]["value"] = "DIFFERENT"
        good, bad = catalog.merge_records([a, b])
        self.assertEqual((len(good), len(bad)), (0, 2))

    def test_explicit_replacement_chain_and_forks(self):
        a = fixture()
        b = copy.deepcopy(a)
        b["fields"]["name"]["value"] = "B"
        b["replacesHash"] = catalog.digest(a)
        c = copy.deepcopy(b)
        c["fields"]["name"]["value"] = "C"
        c["replacesHash"] = catalog.digest(b)
        good, bad = catalog.merge_records([a, b, c])
        self.assertEqual(good, [c])
        self.assertEqual(bad, [])
        d = copy.deepcopy(a)
        d["fields"]["name"]["value"] = "FORK"
        d["replacesHash"] = catalog.digest(a)
        good, bad = catalog.merge_records([a, b, d])
        self.assertEqual(len(good), 0)
        self.assertEqual(len(bad), 3)


class CatalogueBuild(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.out, self.public = self.root / "generated", self.root / "public"
        self.raw = self.root / "raw.json"
        catalog.write_json(self.raw, empty_raw())
        self.region = fixture("test-region", "region")
        self.place = fixture()
        self.input = self.root / "input.json"
        catalog.write_json(self.input, [self.region, self.place])

    def tearDown(self):
        self.temp.cleanup()

    def build(self, reviews=None):
        return catalog.build(self.raw, self.out, self.public, reviews)

    def test_import_build_sqlite_and_publication_are_idempotent(self):
        first = catalog.import_file(self.input, self.out)
        second = catalog.import_file(self.input, self.out)
        self.assertEqual(first["importHash"], second["importHash"])
        self.assertTrue(second["idempotent"])
        before = self.build()
        self.assertEqual(before["valid"], {"region": 1, "place": 1})
        self.assertEqual(before["published"], {})
        reviews = self.root / "reviews.json"
        catalog.review_records([self.region["id"], self.place["id"]], self.out, reviews, "test-fixture-reviewer", "approved")
        after = self.build(reviews)
        self.assertEqual(after["published"], {"region": 1, "place": 1})
        self.assertEqual(after["dataVersion"], self.build(reviews)["dataVersion"])
        with sqlite3.connect(self.out / "catalog.sqlite") as db:
            self.assertEqual(db.execute("SELECT count(*) FROM records").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT count(*) FROM records WHERE publishable=1").fetchone()[0], 2)
        payload = catalog.load_json(self.public / "regions/test-region.json")
        self.assertEqual(payload["places"][0]["fields"]["lat"]["value"], None)
        approved = catalog.load_json(self.public / "approved.json")
        self.assertEqual(len(approved["records"]), 2)

    def test_invalid_region_cannot_leave_published_orphan(self):
        self.region["fields"]["name"]["value"] = ""
        catalog.write_json(self.input, [self.region, self.place])
        catalog.import_file(self.input, self.out)
        summary = self.build()
        self.assertEqual(summary["quarantined"], 2)
        self.assertEqual(summary["published"], {})

    def test_unapproved_parent_prevents_child_publication(self):
        catalog.import_file(self.input, self.out)
        self.build()
        reviews = self.root / "reviews.json"
        catalog.review_records([self.place["id"]], self.out, reviews, "test-fixture-reviewer", "approved")
        self.assertEqual(self.build(reviews)["published"], {})

    def test_revocation_removes_old_static_region_file(self):
        catalog.import_file(self.input, self.out)
        self.build()
        reviews = self.root / "reviews.json"
        catalog.review_records([self.region["id"], self.place["id"]], self.out, reviews, "test-fixture-reviewer", "approved")
        self.build(reviews)
        self.assertTrue((self.public / "regions/test-region.json").exists())
        catalog.review_records([self.region["id"]], self.out, reviews, "test-fixture-reviewer", "rejected")
        self.build(reviews)
        self.assertFalse((self.public / "regions/test-region.json").exists())

    def test_replacement_needs_new_approval_and_reimport_is_idempotent(self):
        catalog.import_file(self.input, self.out)
        self.build()
        reviews = self.root / "reviews.json"
        catalog.review_records([self.region["id"], self.place["id"]], self.out, reviews, "test-fixture-reviewer", "approved")
        changed = copy.deepcopy(self.place)
        changed["fields"]["name"]["value"] = "CORRECTED TEST NAME"
        path = self.root / "correction.json"
        catalog.write_json(path, [changed])
        catalog.import_file(path, self.out, replace=True)
        self.assertTrue(catalog.import_file(path, self.out, replace=True)["idempotent"])
        summary = self.build(reviews)
        self.assertEqual(summary["quarantined"], 0)
        self.assertEqual(summary["published"], {"region": 1})
        self.assertEqual(summary["publicationHolds"]["APPROVAL_STALE"], 1)

    def test_csv_and_json_inputs_have_the_same_schema(self):
        path = self.root / "input.csv"
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["schemaVersion", "id", "kind", "regionId", "demo", "aliases_json", "fields_json", "sources_json"])
            writer.writeheader()
            writer.writerow({"schemaVersion": 1, "id": self.place["id"], "kind": "place", "regionId": self.place["regionId"], "demo": "false", "aliases_json": "[]", "fields_json": json.dumps(self.place["fields"]), "sources_json": json.dumps(self.place["sources"])})
        self.assertEqual(catalog.read_import(path), [self.place])

    def test_nonfinite_import_is_rejected_and_original_is_preserved(self):
        path = self.root / "bad.json"
        path.write_text('[{"lat":NaN}]')
        with self.assertRaises(ValueError):
            catalog.import_file(path, self.out)
        self.assertEqual(len(list((self.out / "raw/imports").glob("*.json"))), 1)


if __name__ == "__main__":
    unittest.main()
