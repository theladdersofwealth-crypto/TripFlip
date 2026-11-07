import approved from "../../public/catalog/approved.json";
import type { PlaceV1 } from "./regionsV1";
import { WORLD_PLACES } from "./worldV1";

export interface CatalogField { value: unknown; status: string; sourceIds: string[] }
export interface CatalogRecord { id: string; kind: string; regionId: string; aliases: string[]; fields: Record<string, CatalogField>; sources: { id: string; url?: string; license?: string; checkedAt?: string }[] }
export const APPROVED_RECORDS = approved.records as CatalogRecord[];
export function verifiedRegionCenter(regionId: string): { lat: number; lon: number } | null {
  const record = APPROVED_RECORDS.find((r) => r.kind === "region" && r.id === regionId);
  const lat = record?.fields.lat, lon = record?.fields.lon;
  return lat?.status === "verified" && lon?.status === "verified" && typeof lat.value === "number" && typeof lon.value === "number" ? { lat: lat.value, lon: lon.value } : null;
}
const PILOT: Record<string, string> = { NT: "vie-nhatrang", HK: "hon-hongkong", DN: "vie-danang", PQ: "vie-phuquoc", OS: "jap-osaka" };
const normalized = (v: string) => v.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const legacyById = new Map(WORLD_PLACES.map((p) => [p.id, p]));
const approvedByIdentity = new Map<string, CatalogRecord>();
for (const record of APPROVED_RECORDS.filter((r) => r.kind === "place")) {
  for (const alias of [record.id, ...record.aliases]) {
    approvedByIdentity.set(`id:${alias}`, record);
    const legacy = legacyById.get(alias);
    if (legacy && legacy.region === record.regionId) {
      approvedByIdentity.set(`${record.regionId}|en:${normalized(legacy.en)}`, record);
      approvedByIdentity.set(`${record.regionId}|ko:${normalized(legacy.name)}`, record);
    }
  }
  if (typeof record.fields.en?.value === "string") approvedByIdentity.set(`${record.regionId}|en:${normalized(record.fields.en.value)}`, record);
}

/** 확인한 명칭·좌표만 보강한다. 기존 AI 등급을 확인된 사실로 승격하지 않는다. */
export function applyApprovedFacts(place: PlaceV1): PlaceV1 {
  const regionId = PILOT[place.region] ?? place.region;
  const record = approvedByIdentity.get(`id:${place.id}`) ?? approvedByIdentity.get(`${regionId}|en:${normalized(place.en)}`) ?? approvedByIdentity.get(`${regionId}|ko:${normalized(place.name)}`);
  if (!record) return place;
  const identity: Record<string, unknown> = {};
  for (const field of ["en", "lat", "lon"]) if (record.fields[field]?.status === "verified" && record.fields[field].value != null) identity[field] = record.fields[field].value;
  return { ...place, ...identity };
}
