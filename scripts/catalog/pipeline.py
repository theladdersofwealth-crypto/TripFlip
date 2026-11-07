#!/usr/bin/env python3
"""Offline catalogue ingestion, review gates, SQLite and static JSON publishing.

Python standard library only. Source modules are extracted by extract.mjs, not
parsed or executed by this script. Existing values are never promoted to verified.
"""
from __future__ import annotations

import argparse
import copy
import csv
import datetime as dt
import hashlib
import json
import math
import re
import shutil
import sqlite3
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = 1
KINDS = {"region", "place", "restaurant", "hotel"}
STATUSES = {"verified", "estimated", "unverified", "unknown"}
LICENSES = {"CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "PUBLIC-DOMAIN", "OWNED", "PERMISSION"}
AI_KINDS = {"ai", "legacy_ai", "editorial", "demo"}
SOURCE_KINDS = AI_KINDS | {"official", "manual", "open_data", "wikidata", "osm", "legacy", "legacy_xotelo", "user"}
PILOTS = {"NT": "vie-nhatrang", "HK": "hon-hongkong", "DN": "vie-danang", "PQ": "vie-phuquoc", "OS": "jap-osaka"}
GRADE = {"S": 5, "A": 4, "B": 3, "C": 2, "D": 1}
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$")


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def reject_nonfinite(value):
    raise ValueError(f"Non-finite JSON number: {value}")


def load_json(path, default=None):
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=reject_nonfinite) if Path(path).exists() else default


def source(source_id, kind, path=None, url=None, license=None, checked_at=None, note=None):
    return {"id": source_id, "kind": kind, "path": path, "url": url, "license": license, "checkedAt": checked_at, "note": note}


def field(value, source_id, status="unverified", method=None):
    return {"value": value, "status": "unknown" if value is None else status, "sourceIds": [source_id], "method": method}


def record(record_id, kind, region_id, fields, sources, aliases=None, demo=False):
    return {"schemaVersion": SCHEMA_VERSION, "id": record_id, "kind": kind, "regionId": region_id, "fields": fields, "sources": sources, "aliases": aliases or [], "demo": demo}


def normalized_name(value):
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", value or "").casefold())


def canonical_legacy(raw):
    """Conservative migration: matching exact English names within a region only.

    A QID supplies an external identifier, not a claim that every field is CC0
    or independently verified. Legacy source licensing stays unresolved.
    """
    modules = raw["modules"]
    world, pilot = modules["worldV1"], modules["regionsV1"]
    attrs = modules["placeAttrs"]["PLACE_ATTRS"]
    fits = modules["placeFit"]["PLACE_FIT"]
    all_records, issues = [], []
    for row in world["WORLD_REGIONS"]:
        sid = "legacy:worldV1"
        fields = {key: field(row.get(key), sid) for key in ["name", "country", "tier", "lat", "lon", "airportCode", "searchName"]}
        fields["airportCode"]["status"] = "estimated" if row.get("airportCode") else "unknown"
        all_records.append(record(row["id"], "region", row["id"], fields, [source(sid, "legacy", "src/data/worldV1.ts", note="Existing catalogue metadata; source license and field verification not documented.")], [key for key, val in PILOTS.items() if val == row["id"]]))

    names = {}
    for filename, rows in [("regionsV1", pilot["PLACES_V1"]), ("worldV1", world["WORLD_PLACES"])]:
        for row in rows:
            region_id = PILOTS.get(row["region"], row["region"])
            identity = (region_id, normalized_name(row.get("en") or row.get("name")))
            if identity in names:
                kept = names[identity]
                if row["id"] not in kept["aliases"]:
                    kept["aliases"].append(row["id"])
                # Keep the second source for audit; do not choose conflicting values.
                issues.append({"id": row["id"], "severity": "info", "code": "EXACT_NAME_ALIAS", "detail": f"Exact regional English-name match retained as alias of {kept['id']}; original stays in raw snapshot."})
                if row.get("lat") is not None and kept["fields"]["lat"]["value"] is None:
                    sid = f"legacy:{filename}"
                    if not any(s["id"] == sid for s in kept["sources"]):
                        kept["sources"].append(source(sid, "legacy_ai", f"src/data/{filename}.ts", note="Legacy mixed Wikidata/OSM coordinates; per-field licensing not proven."))
                    for key in ["lat", "lon", "wikidataId"]:
                        kept["fields"][key] = field(row.get("qid") if key == "wikidataId" else row.get(key), sid)
                continue
            sid = f"legacy:{filename}"
            is_restaurant = "로컬푸드" in row.get("tags", []) or bool(re.search(r"레스토랑|식당|씨푸드|Restaurant|Seafood", row.get("name", "") + row.get("en", ""), re.I))
            fields = {key: field(row.get(key), sid) for key in ["name", "en", "lat", "lon", "concepts", "tags", "note"]}
            fields["wikidataId"] = field(row.get("qid"), sid)
            fields["grade"] = field(GRADE.get(row.get("grade")), sid, "estimated", "AI grade; not an objective or access restriction")
            fields["travel"] = field(row.get("travel"), sid, "estimated", "Legacy distance-band estimate; not a route or verified travel duration")
            fields["adultOnly"] = field(None, sid)
            fields["accessRestrictions"] = field(None, sid)
            fields["strollerAccessible"] = field(None, sid)
            fields["openingHours"] = field(None, sid)
            sources = [source(sid, "legacy_ai", f"src/data/{filename}.ts", note="Name/candidate and grade from existing AI-assisted data; original sources need review before publication.")]
            if row["id"] in attrs:
                a = attrs[row["id"]]
                asid = "legacy:placeAttrs"
                sources.append(source(asid, "ai", "src/data/placeAttrs.ts", note="GPT/Gemini cross-estimate; not field verification."))
                for key, value in zip(["bestTime", "stayMinutes", "childFit"], a):
                    fields[key] = field(value, asid, "estimated")
            else:
                fields["stayMinutes"] = field(None, sid)
            if row["id"] in fits:
                fsid = "legacy:placeFit"
                sources.append(source(fsid, "ai", "src/data/placeFit.ts"))
                fields["companionFit"] = field(fits[row["id"]], fsid, "estimated", "Advisory preference score only; zero is not verified exclusion")
            result = record(row["id"], "restaurant" if is_restaurant else "place", region_id, fields, sources)
            names[identity] = result
            all_records.append(result)

    hsid = "legacy:worldHotels"
    for region_id, hotels in modules["worldHotels"]["HOTELS"].items():
        for name, rating, reviews, lo, hi in hotels:
            record_id = f"hotel:{region_id}:{hashlib.sha256(normalized_name(name).encode()).hexdigest()[:16]}"
            values = {"name": name, "rating": rating, "reviewCount": reviews, "historicalNightlyUsdLow": lo, "historicalNightlyUsdHigh": hi, "cleanliness": None, "roomCapacity": None, "beds": None, "childPolicy": None}
            fields = {key: field(value, hsid) for key, value in values.items()}
            all_records.append(record(record_id, "hotel", region_id, fields, [source(hsid, "legacy_xotelo", "src/data/worldHotels.ts", url="https://xotelo.com/", checked_at="2026-10-31", note="Collection date declared in legacy header; unofficial historical data, rights unresolved; overall rating does not verify cleanliness.")]))

    for kind, key in [("place", "NHA_TRANG_PLACES"), ("restaurant", "NHA_TRANG_RESTAURANTS")]:
        for row in modules["nhaTrang"][key]:
            sid = "legacy:nhaTrang:demo"
            fields = {k: field(v, sid, "estimated") for k, v in row.items() if k not in {"id", "source", "destinationId"}}
            # Even an explicitly true DEMO amenity is not a verified fact.
            fields["accessRestrictions"] = field(None, sid)
            all_records.append(record("demo:" + row["id"], kind, "vie-nhatrang", fields, [source(sid, "demo", "src/data/nhaTrang.ts", note="SAMPLE_DATA; some restaurants are fictional. Never publish as real recommendations.")], demo=True))
    return all_records, issues


def date_valid(value):
    if value is None:
        return True
    try:
        return dt.date.fromisoformat(value).isoformat() == value
    except (ValueError, TypeError):
        return False


def validate_record(row, region_ids):
    errors = []
    if not isinstance(row, dict):
        return [{"code": "NOT_OBJECT", "detail": "Record must be an object."}]
    for key in ["id", "regionId"]:
        if not isinstance(row.get(key), str) or not ID.fullmatch(row[key]):
            errors.append({"code": "INVALID_ID", "detail": key})
    if row.get("schemaVersion") != SCHEMA_VERSION:
        errors.append({"code": "SCHEMA_VERSION", "detail": "Expected schemaVersion 1."})
    if row.get("kind") not in KINDS:
        errors.append({"code": "INVALID_KIND", "detail": "Unsupported record kind."})
    if not isinstance(row.get("demo"), bool):
        errors.append({"code": "INVALID_DEMO_FLAG", "detail": "demo must be true or false."})
    if not isinstance(row.get("aliases", []), list) or any(not isinstance(alias, str) or not ID.fullmatch(alias) for alias in row.get("aliases", [])):
        errors.append({"code": "INVALID_ALIASES", "detail": "aliases must contain valid IDs."})
    if row.get("regionId") not in region_ids:
        errors.append({"code": "UNKNOWN_REGION", "detail": str(row.get("regionId"))})
    if row.get("kind") == "region" and row.get("id") != row.get("regionId"):
        errors.append({"code": "REGION_ID_MISMATCH", "detail": "Region id must equal regionId."})
    sources = row.get("sources")
    if not isinstance(sources, list) or not sources:
        return errors + [{"code": "SOURCES_REQUIRED", "detail": "sources must be a nonempty array."}]
    source_map = {}
    for src in sources:
        if not isinstance(src, dict) or not isinstance(src.get("id"), str) or not isinstance(src.get("kind"), str):
            errors.append({"code": "INVALID_SOURCE", "detail": "Source id and kind required."})
            continue
        if src["id"] in source_map:
            errors.append({"code": "DUPLICATE_SOURCE", "detail": src["id"]})
        source_map[src["id"]] = src
        if src.get("kind") not in SOURCE_KINDS:
            errors.append({"code": "INVALID_SOURCE_KIND", "detail": src["id"]})
        if src.get("url") is not None and (not isinstance(src["url"], str) or not re.match(r"^https?://[^\s/]+", src["url"])):
            errors.append({"code": "INVALID_SOURCE_URL", "detail": src["id"]})
        if not date_valid(src.get("checkedAt")):
            errors.append({"code": "INVALID_CHECK_DATE", "detail": src["id"]})
        if src.get("kind") == "osm" and src.get("license") != "ODbL-1.0":
            errors.append({"code": "OSM_LICENSE_REQUIRED", "detail": "OSM sources must declare ODbL-1.0 and retain attribution."})
    fields = row.get("fields")
    if not isinstance(fields, dict):
        return errors + [{"code": "FIELDS_REQUIRED", "detail": "fields must be an object."}]
    name = fields.get("name", {}).get("value") if isinstance(fields.get("name"), dict) else None
    if not isinstance(name, str) or not name.strip():
        errors.append({"code": "NAME_REQUIRED", "detail": "Nonempty fields.name.value required."})
    for key, item in fields.items():
        if not isinstance(item, dict) or "value" not in item or item.get("status") not in STATUSES:
            errors.append({"code": "INVALID_FIELD", "detail": key})
            continue
        value, status = item["value"], item["status"]
        if (status == "unknown") != (value is None):
            errors.append({"code": "UNKNOWN_NULL_MISMATCH", "detail": key})
        refs = item.get("sourceIds")
        if not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or ref not in source_map for ref in refs):
            errors.append({"code": "FIELD_SOURCE_REQUIRED", "detail": key})
            continue
        selected = [source_map[ref] for ref in refs]
        if status == "verified" and any(src.get("kind") in AI_KINDS or not src.get("checkedAt") or not (src.get("url") or src.get("note")) for src in selected):
            errors.append({"code": "VERIFICATION_EVIDENCE_REQUIRED", "detail": key})
        if key in {"lat", "lon", "grade", "stayMinutes", "rating", "reviewCount", "historicalNightlyUsdLow", "historicalNightlyUsdHigh"} and value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                errors.append({"code": "INVALID_NUMBER", "detail": key})
            elif (key == "lat" and not -90 <= value <= 90) or (key == "lon" and not -180 <= value <= 180) or (key in {"grade", "rating"} and not 0 <= value <= 5) or (key in {"stayMinutes", "reviewCount", "historicalNightlyUsdLow", "historicalNightlyUsdHigh"} and value < 0):
                errors.append({"code": "OUT_OF_RANGE", "detail": key})
        if key in {"accessRestrictions", "minimumAge", "minimumHeightCm", "roomCapacity"} and value is not None and status == "estimated":
            # Such values may be kept for review, but cannot become hard constraints.
            if item.get("useAsHardConstraint"):
                errors.append({"code": "ESTIMATE_IS_NOT_RESTRICTION", "detail": key})
        if item.get("useAsHardConstraint") and status != "verified":
            errors.append({"code": "UNVERIFIED_HARD_CONSTRAINT", "detail": key})
    lat = fields["lat"].get("value") if isinstance(fields.get("lat"), dict) else None
    lon = fields["lon"].get("value") if isinstance(fields.get("lon"), dict) else None
    if (lat is None) != (lon is None):
        errors.append({"code": "INCOMPLETE_COORDINATE_PAIR", "detail": "Both coordinates must exist or both be null."})
    return errors


def publication_holds(row, review):
    holds = []
    if row.get("demo") or any(s.get("kind") == "demo" for s in row["sources"]):
        holds.append("DEMO_NOT_PUBLISHABLE")
    if any(s.get("license") not in LICENSES for s in row["sources"]):
        holds.append("LICENSE_REVIEW_REQUIRED")
    if any(s.get("license") == "PERMISSION" and not s.get("note") for s in row["sources"]):
        holds.append("PERMISSION_EVIDENCE_REQUIRED")
    if any(s.get("license") in {"CC-BY-4.0", "ODbL-1.0"} and (not s.get("attribution") or not s.get("url")) for s in row["sources"]):
        holds.append("ATTRIBUTION_REQUIRED")
    if row["fields"].get("name", {}).get("status") != "verified":
        holds.append("IDENTITY_VERIFICATION_REQUIRED")
    if not review or review.get("state") != "approved":
        holds.append("REVIEW_REQUIRED" if not review or review.get("state") != "rejected" else "REJECTED")
    elif review.get("recordHash") != digest(row):
        holds.append("APPROVAL_STALE")
    elif not review.get("reviewer") or not review.get("reviewedAt") or not date_valid(review.get("reviewedAt")):
        holds.append("REVIEW_METADATA_REQUIRED")
    return holds


def read_import(path):
    path = Path(path)
    if path.suffix.lower() == ".csv":
        result = []
        with path.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                result.append({"schemaVersion": int(row.get("schemaVersion", "1")), "id": row["id"], "kind": row["kind"], "regionId": row["regionId"], "fields": json.loads(row["fields_json"], parse_constant=reject_nonfinite), "sources": json.loads(row["sources_json"], parse_constant=reject_nonfinite), "aliases": json.loads(row.get("aliases_json") or "[]", parse_constant=reject_nonfinite), "demo": row.get("demo", "false").lower() == "true"})
        return result
    data = load_json(path)
    if isinstance(data, dict) and "records" in data:
        data = data["records"]
    if not isinstance(data, list):
        raise ValueError("JSON input must be an array or {records: [...]}.")
    return data


def merge_records(records):
    """Identical imports are idempotent; conflicting IDs quarantine all variants."""
    grouped = {}
    for row in records:
        key = row.get("id") if isinstance(row, dict) else None
        grouped.setdefault(key, {})[digest(row)] = row
    good, quarantine = [], []
    for key, versions in grouped.items():
        if len(versions) > 1:
            replaced = [row.get("replacesHash") for row in versions.values() if isinstance(row, dict) and row.get("replacesHash") in versions]
            heads = set(versions) - set(replaced)
            chain = set()
            if len(heads) == 1 and len(replaced) == len(set(replaced)):
                current = next(iter(heads))
                while current in versions and current not in chain:
                    chain.add(current)
                    parent = versions[current].get("replacesHash") if isinstance(versions[current], dict) else None
                    if not parent:
                        break
                    current = parent
            if len(chain) == len(versions) and len(heads) == 1:
                good.append(versions[next(iter(heads))])
            else:
                quarantine.extend({"record": row, "errors": [{"code": "CONFLICTING_ID", "detail": str(key)}]} for row in versions.values())
        else:
            good.append(next(iter(versions.values())))
    return good, quarantine


def build(input_path, output_path, public_path, reviews_path=None):
    out, public = Path(output_path), Path(public_path)
    raw = load_json(input_path)
    if not raw or raw.get("schemaVersion") != 1 or not isinstance(raw.get("modules"), dict):
        raise ValueError("Run extract.mjs first; unsupported extraction format.")
    records, issues = canonical_legacy(raw)
    imported = []
    for path in sorted((out / "staging" / "imports").glob("*.json")):
        imported.extend(load_json(path, []))
    records, quarantined = merge_records(records + imported)
    region_ids = {row.get("id") for row in records if isinstance(row, dict) and row.get("kind") == "region" and isinstance(row.get("id"), str)}
    valid = []
    for row in records:
        errors = validate_record(row, region_ids)
        if errors:
            quarantined.append({"record": row, "errors": errors})
        else:
            valid.append(row)
    # Do not leave dependent records attached to an invalid/quarantined region.
    valid_regions = {row["id"] for row in valid if row["kind"] == "region"}
    checked = []
    for row in valid:
        if row["regionId"] not in valid_regions:
            quarantined.append({"record": row, "errors": [{"code": "INVALID_REGION_PARENT", "detail": row["regionId"]}]})
        else:
            checked.append(row)
    valid = sorted(checked, key=lambda row: row["id"])
    reviews = load_json(reviews_path, {}) if reviews_path else {}
    review_rows = []
    publishable = []
    for row in valid:
        holds = publication_holds(row, reviews.get(row["id"]))
        review_rows.append({"record": row, "recordHash": digest(row), "review": reviews.get(row["id"]), "holds": holds})
        if not holds:
            publishable.append(row)
    published_region_ids = {row["id"] for row in publishable if row["kind"] == "region"}
    publishable = [row for row in publishable if row["regionId"] in published_region_ids]
    field_counts = Counter(field["status"] for row in valid for field in row["fields"].values())
    summary = {
        "schemaVersion": 1,
        "sourceFiles": raw.get("files", {}),
        "rawCounts": {"worldRegions": len(raw["modules"]["worldV1"]["WORLD_REGIONS"]), "worldPlaces": len(raw["modules"]["worldV1"]["WORLD_PLACES"]), "pilotPlaces": len(raw["modules"]["regionsV1"]["PLACES_V1"]), "legacyHotelRegions": len(raw["modules"]["worldHotels"]["HOTELS"]), "legacyHotels": sum(len(v) for v in raw["modules"]["worldHotels"]["HOTELS"].values()), "legacyDemoRestaurants": len(raw["modules"]["nhaTrang"]["NHA_TRANG_RESTAURANTS"]), "companionFitRows": len(raw["modules"]["placeFit"]["PLACE_FIT"])},
        "valid": dict(Counter(row["kind"] for row in valid)),
        "published": dict(Counter(row["kind"] for row in publishable)),
        "fieldStatuses": dict(field_counts),
        "quarantined": len(quarantined),
        "deduplicatedAliases": len(issues),
        "importedRows": len(imported),
        "demoRecords": sum(row["demo"] for row in valid),
        "publicationHolds": dict(Counter(hold for row in review_rows for hold in row["holds"])),
        "missingCoordinates": sum(row["kind"] in {"place", "restaurant"} and row["fields"].get("lat", {}).get("value") is None for row in valid),
        "notes": ["Source snapshots retained; no network or paid API used.", "Unverified source data is retained for review, not promoted to verified.", "Overall hotel rating does not establish cleanliness, room capacity or live price.", "An AI companion-fit score of zero is advisory, never a verified access prohibition."],
    }
    version = digest({"sources": raw.get("files", {}), "records": valid, "reviews": reviews})[:20]
    summary["dataVersion"] = version
    write_json(out / "review" / "records.json", review_rows)
    write_json(out / "review" / "quarantine.json", quarantined)
    write_json(out / "review" / "issues.json", issues)
    write_json(out / "summary.json", summary)
    # Rebuild only our own generated regions; stale approved records cannot survive.
    region_dir = public / "regions"
    if region_dir.exists():
        for path in region_dir.glob("*.json"):
            path.unlink()
    region_dir.mkdir(parents=True, exist_ok=True)
    manifest_regions = []
    for region in sorted((row for row in publishable if row["kind"] == "region"), key=lambda row: row["id"]):
        contents = [row for row in publishable if row["regionId"] == region["id"] and row["kind"] != "region"]
        payload = {"schemaVersion": 1, "dataVersion": version, "region": region, "places": [row for row in contents if row["kind"] == "place"], "restaurants": [row for row in contents if row["kind"] == "restaurant"], "hotels": [row for row in contents if row["kind"] == "hotel"]}
        url = f"/catalog/regions/{region['id']}.json"
        write_json(region_dir / f"{region['id']}.json", payload)
        manifest_regions.append({"id": region["id"], "name": region["fields"]["name"]["value"], "counts": dict(Counter(row["kind"] for row in contents)), "url": url})
    public_summary = {key: summary[key] for key in ["valid", "published", "fieldStatuses", "quarantined", "demoRecords", "publicationHolds", "rawCounts"]}
    write_json(public / "manifest.json", {"schemaVersion": 1, "dataVersion": version, "regions": manifest_regions, "summary": public_summary})
    write_json(public / "approved.json", {"schemaVersion": 1, "dataVersion": version, "records": publishable})
    out.mkdir(parents=True, exist_ok=True)
    db_path = out / "catalog.sqlite"
    with sqlite3.connect(db_path) as db:
        db.executescript("DROP TABLE IF EXISTS records; DROP TABLE IF EXISTS metadata; DROP TABLE IF EXISTS sources; DROP TABLE IF EXISTS issues; CREATE TABLE records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, region_id TEXT NOT NULL, name TEXT NOT NULL, payload_json TEXT NOT NULL, record_hash TEXT NOT NULL, review_state TEXT NOT NULL, publishable INTEGER NOT NULL); CREATE INDEX records_region_kind ON records(region_id, kind); CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE sources(record_id TEXT NOT NULL, source_id TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(record_id, source_id)); CREATE TABLE issues(record_id TEXT, severity TEXT, code TEXT, detail TEXT);")
        published_ids = {row["id"] for row in publishable}
        for entry in review_rows:
            row = entry["record"]
            review = entry["review"] or {}
            db.execute("INSERT INTO records VALUES(?,?,?,?,?,?,?,?)", (row["id"], row["kind"], row["regionId"], row["fields"]["name"]["value"], encoded(row), entry["recordHash"], review.get("state", "pending"), int(row["id"] in published_ids)))
            db.executemany("INSERT INTO sources VALUES(?,?,?)", [(row["id"], s["id"], encoded(s)) for s in row["sources"]])
        db.executemany("INSERT INTO issues VALUES(?,?,?,?)", [(issue.get("id"), issue.get("severity", "error"), issue["code"], issue["detail"]) for issue in issues])
        for entry in quarantined:
            db.executemany("INSERT INTO issues VALUES(?,?,?,?)", [(entry["record"].get("id") if isinstance(entry["record"], dict) else None, "error", error["code"], error["detail"]) for error in entry["errors"]])
        db.execute("INSERT INTO metadata VALUES(?,?)", ("summary", encoded(summary)))
    return summary


def import_file(path, output, replace=False):
    path, out = Path(path), Path(output)
    raw = path.read_bytes()
    fingerprint = hashlib.sha256(raw).hexdigest()
    # Preserve input bytes before schema validation, including malformed records.
    raw_dir = out / "raw" / "imports"
    raw_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, raw_dir / f"{fingerprint}{path.suffix.lower()}")
    rows = read_import(path)
    staging_path = out / "staging" / "imports" / f"{fingerprint}.json"
    existing_staged = load_json(staging_path)
    if existing_staged is not None and (not replace or any(isinstance(row, dict) and row.get("replacesHash") for row in existing_staged)):
        return {"rows": len(existing_staged), "importHash": fingerprint, "staged": True, "published": False, "idempotent": True}
    if replace:
        previous = {entry["record"]["id"]: entry["recordHash"] for entry in load_json(out / "review" / "records.json", [])}
        for row in rows:
            if isinstance(row, dict) and row.get("id") in previous:
                row["replacesHash"] = previous[row["id"]]
    write_json(staging_path, rows)
    return {"rows": len(rows), "importHash": fingerprint, "staged": True, "published": False}


def review_records(ids, output, reviews_path, reviewer, state):
    entries = load_json(Path(output) / "review" / "records.json", [])
    rows = {entry["record"]["id"]: entry["record"] for entry in entries}
    reviews = load_json(reviews_path, {})
    for record_id in ids:
        if record_id not in rows:
            raise ValueError(f"No valid staged record: {record_id}")
        row = rows[record_id]
        proposal = {"state": state, "reviewer": reviewer, "reviewedAt": dt.date.today().isoformat(), "recordHash": digest(row)}
        holds = publication_holds(row, proposal)
        if state == "approved" and holds:
            raise ValueError(f"Cannot approve {record_id}: {', '.join(holds)}. Correct sources and identity first, import, rebuild, and review again.")
        reviews[record_id] = proposal
    write_json(reviews_path, reviews)
    return {"reviewed": ids, "state": state, "note": "Rebuild with --reviews to update public output."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("build")
    p.add_argument("--input", type=Path, default=ROOT / "data/generated/raw/extracted.json")
    p.add_argument("--output", type=Path, default=ROOT / "data/generated")
    p.add_argument("--public", type=Path, default=ROOT / "public/catalog")
    p.add_argument("--reviews", type=Path, default=ROOT / "data/catalog-reviews.json")
    p = sub.add_parser("import")
    p.add_argument("file", type=Path)
    p.add_argument("--output", type=Path, default=ROOT / "data/generated")
    p.add_argument("--replace", action="store_true", help="Replace a currently staged ID by pinning its current hash; requires fresh review.")
    p = sub.add_parser("review")
    p.add_argument("--id", action="append", required=True)
    p.add_argument("--output", type=Path, default=ROOT / "data/generated")
    p.add_argument("--reviews", type=Path, required=True)
    p.add_argument("--reviewer", required=True)
    p.add_argument("--state", choices=["approved", "rejected"], required=True)
    args = parser.parse_args()
    try:
        if args.command == "build":
            result = build(args.input, args.output, args.public, args.reviews)
        elif args.command == "import":
            result = import_file(args.file, args.output, args.replace)
        else:
            result = review_records(args.id, args.output, args.reviews, args.reviewer, args.state)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"catalog: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
