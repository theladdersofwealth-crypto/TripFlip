// Compile only the catalogue coordinates; never fall back to an unrelated city.
import { WORLD_REGIONS } from "../src/data/worldV1.ts";
const ids = new Set();
const rows = WORLD_REGIONS.map(({ id, name, lat, lon }) => {
  if (ids.has(id) || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`Invalid climate centre: ${id}`);
  ids.add(id);
  return { id, name, lat, lon };
});
process.stdout.write(JSON.stringify(rows) + "\n");
