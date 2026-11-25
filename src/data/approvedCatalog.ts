import approved from "../../public/catalog/approved.json";
import type { PlaceV1 } from "./regionsV1";
import { WORLD_PLACES } from "./worldV1";

export interface CatalogField { value: unknown; status: string; sourceIds: string[]; useAsHardConstraint?: boolean }
export interface CatalogRecord { id: string; kind: string; regionId: string; aliases: string[]; fields: Record<string, CatalogField>; sources: { id: string; kind?: string; url?: string; license?: string; checkedAt?: string; note?: string }[] }
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

export interface AdmissionEvidence {
  minimumAge?: number;
  minimumHeightCm?: number;
  needsCheck: boolean;
}

const nonEvidenceKinds = new Set(["ai", "legacy_ai", "editorial", "demo"]);

/** 승인 카탈로그의 장소 자체 입장 조건만 사용한다. 자유 문구는 판정 근거가 아니다. */
export function admissionEvidence(record?: CatalogRecord): AdmissionEvidence | undefined {
  if (record?.kind !== "place") return;
  const evidence: AdmissionEvidence = { needsCheck: !!record.fields.accessRestrictions };
  for (const key of ["minimumAge", "minimumHeightCm"] as const) {
    const field = record.fields[key];
    if (!field) continue;
    const sourced = field.sourceIds?.length && field.sourceIds.every((id) => {
      const source = record.sources.find((s) => s.id === id);
      return source?.kind && !nonEvidenceKinds.has(source.kind) && source.checkedAt && (source.url || source.note);
    });
    if (field.status === "verified" && field.useAsHardConstraint === true && sourced &&
        typeof field.value === "number" && Number.isFinite(field.value) && field.value > 0 &&
        (key !== "minimumAge" || Number.isInteger(field.value))) {
      evidence[key] = field.value;
    } else {
      evidence.needsCheck = true;
    }
  }
  return evidence.needsCheck || evidence.minimumAge != null || evidence.minimumHeightCm != null ? evidence : undefined;
}

/** 확인한 명칭·좌표를 보강하고, 입장 조건은 명시적 동일 ID·별칭에서만 가져온다. */
export function applyApprovedFacts(place: PlaceV1): PlaceV1 {
  const regionId = PILOT[place.region] ?? place.region;
  const record = approvedByIdentity.get(`id:${place.id}`) ?? approvedByIdentity.get(`${regionId}|en:${normalized(place.en)}`) ?? approvedByIdentity.get(`${regionId}|ko:${normalized(place.name)}`);
  if (!record) return place;
  const identity: Record<string, unknown> = {};
  for (const field of ["en", "lat", "lon"]) if (record.fields[field]?.status === "verified" && record.fields[field].value != null) identity[field] = record.fields[field].value;
  const exact = approvedByIdentity.get(`id:${place.id}`);
  const admission = exact?.regionId === regionId ? admissionEvidence(exact) : undefined;
  return { ...place, ...identity, ...(admission && { admission }) };
}
