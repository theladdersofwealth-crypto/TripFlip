"""Supplement ERA5 with NASA POWER rain-day count and clearly estimated sunshine."""
import argparse
import calendar
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request

POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
FIELDS = ("PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN")

def fetch(lat, lon, start, end):
    query = urllib.parse.urlencode(dict(
        parameters=",".join(FIELDS), community="RE", latitude=lat, longitude=lon,
        start=f"{start}0101", end=f"{end}1231", format="JSON", **{"time-standard": "LST"}
    ))
    for attempt in range(3):
        try:
            req = urllib.request.Request(f"{POWER}?{query}", headers={"User-Agent": "TripFlip climate catalog"})
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.load(resp)
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))

def summer_hours(lat, month):
    doy = dt.date(2025, month, 15).timetuple().tm_yday
    decl = math.radians(23.44) * math.sin(2 * math.pi / 365 * (doy - 81))
    return 24 / math.pi * math.acos(max(-1, min(1, -math.tan(math.radians(lat)) * math.tan(decl))))

def aggregate(doc, row, start, end):
    p = doc["properties"]["parameter"]
    months = {}
    for m in range(1, 13):
        days = [f"{y:04d}{m:02d}{d:02d}" for y in range(start, end+1)
                for d in range(1, calendar.monthrange(y, m)[1]+1)]
        rain = [p[FIELDS[0]].get(d, -999) for d in days]
        if not all(math.isfinite(v) and v >= 0 for v in rain):
            raise ValueError(f"{row['id']} invalid precipitation days in {m}")
        radiation = [(p[FIELDS[1]].get(d, -999), p[FIELDS[2]].get(d, -999)) for d in days]
        good = [(a, c) for a, c in radiation if math.isfinite(a) and math.isfinite(c) and a >= 0 and c > 0]
        # The original sunshine proxy, without a cross-region station calibration.
        sun = (max(0, min(1, (sum(a for a, _ in good) / sum(c for _, c in good) - 0.3) / 0.7))
               * summer_hours(row["lat"], m) * len(days) / (end-start+1)) if len(good) >= len(days) * .99 else None
        months[m] = dict(rainDays=round(sum(v >= 1 for v in rain) / (end-start+1), 1),
                         sunHours=None if sun is None else round(sun))
    return {"months": months, "version": doc.get("header", {}).get("api", {}).get("version")}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("centers", type=Path)
    parser.add_argument("cache", type=Path)
    parser.add_argument("--start", type=int, default=2021)
    parser.add_argument("--end", type=int, default=2025)
    args = parser.parse_args()
    if args.end - args.start != 4:
        parser.error("request exactly five complete years")
    args.cache.mkdir(parents=True, exist_ok=True)
    rows = json.loads(args.centers.read_text())
    def collect(row):
        target = args.cache / (row["id"] + ".json")
        if target.exists():
            return
        doc = fetch(row["lat"], row["lon"], args.start, args.end)
        vals = aggregate(doc, row, args.start, args.end)
        vals.update(period=[args.start, args.end], coordinates=[row["lat"], row["lon"]])
        tmp = target.with_suffix(".part")
        tmp.write_text(json.dumps(vals), encoding="utf-8")
        tmp.replace(target)
    with ThreadPoolExecutor(max_workers=5) as pool:
        jobs = [(row, pool.submit(collect, row)) for row in rows]
        errors = []
        for row, job in jobs:
            try:
                job.result()
            except Exception as exc:
                errors.append((row["id"], str(exc)))
                print(errors[-1], flush=True)
        if errors:
            raise SystemExit(f"{len(errors)} regions failed; no incomplete catalogue will be published.")
    print(f"{len(rows)} NASA POWER regions validated.", flush=True)

if __name__ == "__main__":
    main()
