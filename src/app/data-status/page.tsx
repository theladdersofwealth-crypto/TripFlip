import Link from "next/link";
import manifest from "../../../public/catalog/manifest.json";
import { APPROVED_RECORDS } from "@/data/approvedCatalog";
import { DINING_CATALOG } from "@/data/dining";

export default function DataStatusPage() {
  const regions = APPROVED_RECORDS.filter((r) => r.kind === "region");
  const places = APPROVED_RECORDS.filter((r) => r.kind === "place");
  return <main className="container page" style={{ maxWidth: 680 }}>
    <Link href="/" className="back-btn">← 여행 조건으로</Link>
    <h1 style={{ fontSize: 24, fontWeight: 900 }}>데이터 출처와 확인 상태</h1>
    <p className="small muted">추천에 사용하는 기존 자료에는 AI 추정값과 재확인이 필요한 정보가 포함돼 있어요. 아래는 별도로 출처와 이용 조건을 검토한 공개 자료예요.</p>
    <div className="card-soft stack" style={{ marginTop: 16 }}>
      <b>출처 검토 자료 · 권역 {regions.length}곳, 장소 {places.length}곳</b>
      <p className="small muted">이름·좌표를 확인한 사실과 취향·등급 추정은 구분해요. 이름이 확인됐어도 영업 여부·입장 제한·가격까지 확인됐다는 뜻은 아니에요.</p>
      <p className="xs muted">데이터 버전 {manifest.dataVersion}</p>
    </div>
    <section className="card stack" style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18 }}>식당·카페 {DINING_CATALOG.places.length}곳 · 공개 가이드 등록 자료</h2>
      <p className="small muted">상호와 기재된 주소·좌표를 원문에서 확인했어요. 영업 여부·가격·가족 편의시설은 미확인이며, 음식 종류는 설명에 따른 분류예요.</p>
      <div className="row-wrap">{[{ id: "NT", name: "나트랑" }, { id: "DN", name: "다낭" }, { id: "PQ", name: "푸꾸옥" }, { id: "HK", name: "홍콩" }, { id: "OS", name: "오사카" }].map((r) => <span className="chip" key={r.id}>{r.name} {DINING_CATALOG.places.filter((p) => p.region === r.id).length}곳</span>)}</div>
      <p className="xs muted">좌표가 있는 후보만 자동 동선 추천에 사용해요. 주소만 있는 후보는 위치 확인이 필요하다고 표시합니다.</p>
      <p className="xs"><a href="/dining/catalog.json" target="_blank" rel="noopener noreferrer">식당 자료와 출처 내려받기</a> · Wikivoyage contributors · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p>
    </section>
    <div className="stack" style={{ marginTop: 16 }}>{regions.map((region) => <section className="card stack" key={region.id}>
      <h2 style={{ fontSize: 18 }}>{String(region.fields.name?.value ?? region.id)} · {String(region.fields.en?.value ?? "")}</h2>
      {places.filter((p) => p.regionId === region.id).map((place) => <div key={place.id} className="card-soft">
        <b className="small">{String(place.fields.name?.value ?? place.id)}</b>
        <p className="xs muted">{String(place.fields.en?.value ?? "")} · 좌표 {String(place.fields.lat?.value ?? "미확인")}, {String(place.fields.lon?.value ?? "미확인")}</p>
        {place.sources.filter((s) => s.url?.startsWith("https://")).map((source) => <p key={source.id} className="xs"><a href={source.url} target="_blank" rel="noopener noreferrer">원문 확인</a> · {source.license} · {source.checkedAt}</p>)}
        <p className="xs muted">영업·체류시간·접근성·추천 등급은 이 자료에서 확인하지 않았어요.</p>
      </div>)}
    </section>)}</div>
    <p className="xs muted" style={{ marginTop: 16 }}>기존 자료는 이용 조건·정체성·최신성을 순차적으로 검토하고 있어요. 확인하지 못한 내용을 확정 정보로 표시하지 않습니다.</p>
  </main>;
}
