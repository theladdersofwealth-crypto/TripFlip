#!/usr/bin/env python3
"""Build a source-attributed dining catalogue from cached, licensed Wikivoyage listings.

No AI/API keys. Names and coordinates are source-confirmed, not on-site verified.
Cuisine classifications are editorial estimates; hours, prices and family facilities
are deliberately not inferred. Output remains CC BY-SA 4.0 with attribution.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = {"nhatrang": ("vie-nhatrang", "NT"), "danang": ("vie-danang", "DN"), "phuquoc": ("vie-phuquoc", "PQ"), "hongkong-central": ("hon-hongkong", "HK"), "hongkong-kowloon": ("hon-hongkong", "HK"), "osaka": ("jap-osaka", "OS"), "osaka-kita": ("jap-osaka", "OS")}
LICENSE = "CC-BY-SA-4.0"
ATTRIBUTION = "Wikivoyage contributors · CC BY-SA 4.0"

def clean(value):
    value = re.sub(r"<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>", "", value, flags=re.S)
    value = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", value)
    value = re.sub(r"\[\[([^\]]+)\]\]", r"\1", value)
    value = re.sub(r"<[^>]+>|'{2,5}", "", value)
    return html.unescape(re.sub(r"\s+", " ", value)).strip()

def listings(text):
    """Split listing parameters while preserving nested templates and wiki links."""
    starts = re.finditer(r"\{\{\s*(eat|drink)\s*\|", text, re.I)
    for start in starts:
        depth, links, i = 1, 0, start.end()
        parts, piece = [], i
        while i < len(text):
            pair = text[i:i+2]
            if pair == "{{": depth += 1; i += 2; continue
            if pair == "}}":
                depth -= 1
                if depth == 0:
                    parts.append(text[piece:i]); break
                i += 2; continue
            if pair == "[[": links += 1; i += 2; continue
            if pair == "]]": links = max(0, links - 1); i += 2; continue
            if text[i] == "|" and depth == 1 and not links:
                parts.append(text[piece:i]); piece = i + 1
            i += 1
        if depth != 0: continue
        params = {k.strip().lower(): v.strip() for p in parts if "=" in p for k, v in [p.split("=", 1)]}
        yield start.group(1).lower(), params

def coordinates(params):
    try:
        lat, lon = float(params.get("lat", "")), float(params.get("long", ""))
        return (lat, lon) if -90 <= lat <= 90 and -180 <= lon <= 180 else (None, None)
    except ValueError: return None, None

def classify(name, description, region):
    text = f"{name} {description}".lower()
    if re.search(r"mcdonald|burger king|lotteria|\bkfc\b|fast food|fast-food", text): return ["fastfood"], "패스트푸드"
    matches = [
        (r"vietnamese|vietnamien|베트남|vietnamita|phở|bánh|mì quảng", "베트남식", "vietnam"),
        (r"japanese|japonais|sushi|ramen|udon|okonomiyaki|takoyaki", "일식", "japan"),
        (r"chinese|cantonese|dim sum|dimsum|sichuan", "중식", "china"),
        (r"korean|kimchi|한국|한식", "한식", "korea"),
        (r"indian|tandoor|인도식", "인도식", "india"),
        (r"thai food|thai restaurant|thai cuisine|태국식", "태국식", "thailand"),
        (r"italian|pizza|pasta", "이탈리안", "western"),
        (r"french|french cuisine", "프렌치", "western"),
        (r"mexican|tacos|burrito", "멕시칸", "western"),
        (r"american|steakhouse|western food|western cuisine", "서양식", "western"),
    ]
    for pattern, label, family in matches:
        if re.search(pattern, text):
            if family == "western": return ["western"], label
            local = (family == "vietnam" and region in {"NT", "DN", "PQ"}) or family == "china" and region == "HK" or family == "japan" and region == "OS"
            return (["local", "asian"] if local else ["asian"]), label
    if re.search(r"local (food|cuisine)|traditional (food|cuisine)", text): return ["local"], "현지식"
    return [], None

def build(source_dir, output, database=None):
    rights = json.loads((source_dir / 'license.json').read_text())["query"]["rightsinfo"]
    if 'creativecommons.org/licenses/by-sa/4.0/' not in rights['url']:
        raise ValueError('Review source licensing before publishing.')
    acquisition = json.loads((source_dir / 'acquisition.json').read_text())
    rows, evidence, skipped = [], [], []
    for key, (region_id, region) in PAGES.items():
        path = source_dir / (key + ".json")
        if not path.exists(): continue
        raw = path.read_bytes(); data = json.loads(raw); page = data.get("parse")
        if not page:
            skipped.append({"page": key, "reason": data.get("error", {}).get("code", "no page")}); continue
        title, revision = page["title"], page.get("revid")
        if not revision: raise ValueError(f"Revision required: {key}")
        receipt = acquisition.get(path.name, {})
        if receipt.get('sha256') != hashlib.sha256(raw).hexdigest() or receipt.get('revision') != revision:
            raise ValueError(f'Source changed; record a new acquisition and review: {key}')
        checked_at = receipt['retrievedAt'][:10]
        url = "https://en.wikivoyage.org/w/index.php?" + __import__('urllib.parse', fromlist=['urlencode']).urlencode({"title": title, "oldid": revision})
        evidence.append({"file": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(raw).hexdigest(), "title": title, "revision": revision, "url": url})
        for kind, params in listings(page.get("wikitext", {}).get("*", "")):
            name = clean(params.get("name", ""))
            if not name or "{{" in name or name.casefold() in {"night market", "tamago-yaki stand"}: continue
            description = clean(params.get("content", ""))
            cafe = kind == "drink" and bool(re.search(r"caf[eé]|coffee|tea house|gelato|ice.?cream", name + " " + description[:100], re.I)) and not re.search(r"nightclub|disco|strip club|\bpub\b|\bbar\b", name, re.I)
            if kind == "drink" and not cafe: continue
            lat, lon = coordinates(params)
            address = clean(params.get("address", "")) or None
            if lat is None and address is None:
                skipped.append({"page": key, "name": name, "reason": "no specific branch location"}); continue
            styles, cuisine = classify(name, description, region)
            website = params.get("url", "").strip()
            if not re.match(r"^https?://[^\s]+$", website): website = None
            identity = f"{page['pageid']}|{name.casefold()}|{lat}|{lon}|{address}"
            rows.append({"id": "wv-" + hashlib.sha256(identity.encode()).hexdigest()[:18], "region": region, "regionId": region_id,
                "name": name, "address": address, "lat": lat, "lon": lon, "kind": "cafe" if cafe else "restaurant", "styles": styles, "cuisine": cuisine,
                "website": website, "source": "Wikivoyage", "sourceUrl": url, "checkedAt": checked_at, "license": LICENSE,
                "grade": None, "openingHours": None, "kidsChair": None, "kidsMenu": None, "price": None, "classificationStatus": "estimated" if cuisine else "unknown"})
    # Same venue repeated in guides is one candidate; distinct branches keep their points.
    unique = {}
    for row in rows:
        key = (row["region"], re.sub(r"[^\w]", "", row["name"].casefold()), round(row["lat"], 4) if row["lat"] is not None else row["address"], round(row["lon"], 4) if row["lon"] is not None else None)
        unique.setdefault(key, row)
    rows = sorted(unique.values(), key=lambda r: (r["region"], r["kind"], r["name"]))
    payload = {"schemaVersion": 1, "license": LICENSE, "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "attribution": ATTRIBUTION,
        "checkedAt": max((r['checkedAt'] for r in rows), default=None), "verificationScope": "Names, addresses and any listed coordinates checked against cited guide revisions; current operation, menus, prices and family amenities unverified. Cuisine classification is an editorial estimate.",
        "sources": evidence, "places": rows}
    output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    if database is not None:
        import sqlite3
        database.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(database) as db:
            db.execute('CREATE TABLE IF NOT EXISTS dining (id TEXT PRIMARY KEY, region TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, record_json TEXT NOT NULL)')
            db.execute('DELETE FROM dining')
            db.executemany('INSERT INTO dining VALUES (?,?,?,?,?)', [(r['id'], r['region'], r['kind'], r['name'], json.dumps(r, ensure_ascii=False)) for r in rows])
    (source_dir / 'build-report.json').write_text(json.dumps({"published": len(rows), "skipped": skipped}, ensure_ascii=False, indent=2) + "\n")
    return payload

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', type=Path, default=ROOT / 'data/imports/sources/wikivoyage')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/dining/catalog.json')
    parser.add_argument('--database', type=Path, default=ROOT / 'data/generated/dining.sqlite')
    args = parser.parse_args(); result = build(args.sources, args.output, args.database)
    from collections import Counter
    print(json.dumps({'total': len(result['places']), 'regions': dict(Counter(r['region'] for r in result['places'])), 'kind': dict(Counter(r['kind'] for r in result['places']))}, ensure_ascii=False))
