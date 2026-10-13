import type { CaseDocumentModel } from "../domain/documentModel";
import type { CaseRecord, PartyRecord } from "../types";

export type PdfPageOrientation = "portrait" | "landscape";

export interface ReferencePdfPage {
  element: HTMLElement;
  orientation: PdfPageOrientation;
}

const portraitSize = { width: 794, height: 1123 };
const landscapeSize = { width: 1123, height: 794 };

function templateAssetUrl(fileName: string): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  return new URL(`document-templates/${fileName}`, baseUrl).toString();
}

function createPage(orientation: PdfPageOrientation, className: string): HTMLElement {
  const size = orientation === "portrait" ? portraitSize : landscapeSize;
  const page = document.createElement("article");
  page.className = `reference-pdf-page ${className}`;
  Object.assign(page.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${size.width}px`,
    height: `${size.height}px`,
    overflow: "hidden",
    background: "#ffffff",
    color: "#111111",
    fontFamily: '"NanumGothic", "Noto Sans KR", sans-serif',
    boxSizing: "border-box",
    zIndex: "-1",
  });
  document.body.append(page);
  return page;
}

function appendStyle(page: HTMLElement, css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  page.append(style);
}

function textElement(
  page: HTMLElement,
  value: string,
  options: {
    left: number;
    top: number;
    width?: number;
    height?: number;
    fontSize?: number;
    align?: "left" | "center" | "right";
    weight?: number;
    lineHeight?: number;
  },
): HTMLElement {
  const element = document.createElement("div");
  element.textContent = value === "작성 필요" ? "" : value;
  Object.assign(element.style, {
    position: "absolute",
    left: `${options.left}%`,
    top: `${options.top}%`,
    width: `${options.width ?? 30}%`,
    height: options.height ? `${options.height}%` : "auto",
    fontSize: `${options.fontSize ?? 13}px`,
    lineHeight: String(options.lineHeight ?? 1.25),
    fontWeight: String(options.weight ?? 500),
    textAlign: options.align ?? "left",
    whiteSpace: "pre-wrap",
    overflow: options.height ? "hidden" : "visible",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
  });
  page.append(element);
  return element;
}

function fieldMap(model: CaseDocumentModel): Map<string, string> {
  return new Map(model.sections.flatMap((section) => section.fields.map((field) => [field.id, field.value] as const)));
}

function value(fields: Map<string, string>, id: string, fallback = ""): string {
  const result = fields.get(id) ?? fallback;
  return result === "작성 필요" ? "" : result;
}

function applicant(caseRecord: CaseRecord): PartyRecord | undefined {
  return caseRecord.parties.find((party) => party.role === "applicant");
}

function formatKoreanDate(source: string): string {
  if (!source) return "";
  const [year, month, day] = source.slice(0, 10).split("-");
  if (!year || !month || !day) return source;
  return `${year}년 ${month}월 ${day}일`;
}

function koreanDateParts(source: string): [string, string, string] {
  const [year = "", month = "", day = ""] = source.slice(0, 10).split("-");
  return [year, month ? String(Number(month)) : "", day ? String(Number(day)) : ""];
}

function seoulToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function addOfficialDate(
  page: HTMLElement,
  source: string,
  positions: Array<{ left: number; width: number }>,
  top: number,
): void {
  koreanDateParts(source).forEach((part, index) => {
    textElement(page, part, { ...positions[index], top, fontSize: 9.5, align: "right" });
  });
}

function compactArea(valueToFormat: number | undefined): string {
  return valueToFormat === undefined ? "-" : valueToFormat.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function actionSelected(actionTypes: string, label: string): boolean {
  return actionTypes.replaceAll(" ", "").includes(label.replaceAll(" ", ""));
}

function buildDevelopmentApplicationPages(caseRecord: CaseRecord, model: CaseDocumentModel): ReferencePdfPage[] {
  const fields = fieldMap(model);
  const front = createPage("portrait", "official-development-form");
  const frontImage = templateAssetUrl("development-application-page-1.png");
  front.dataset.backgroundImage = frontImage;
  Object.assign(front.style, {
    backgroundImage: `url("${frontImage}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
  });

  const actionTypes = value(fields, "actionTypes");
  [
    ["공작물설치", 10.7],
    ["토지형질변경", 29.1],
    ["토석채취", 48.0],
    ["토지분할", 67.2],
    ["물건적치", 85.6],
  ].forEach(([label, left]) => {
    if (actionSelected(actionTypes, String(label))) textElement(front, "✓", { left: Number(left), top: 16.75, width: 2.6, fontSize: 14, weight: 800, align: "center" });
  });

  const applicantName = [value(fields, "applicantName"), value(fields, "representativeName")].filter(Boolean).join(" / ");
  textElement(front, applicantName, { left: 20.3, top: 21.2, width: 38.2, fontSize: 10.5, align: "center" });
  textElement(front, value(fields, "registrationNumber"), { left: 64.2, top: 21.2, width: 24.0, fontSize: 10.5, align: "center" });
  textElement(front, value(fields, "applicantAddress"), { left: 16.1, top: 23.8, width: 73.0, fontSize: 10 });
  textElement(front, value(fields, "applicantPhone"), { left: 61.2, top: 25.9, width: 24.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "siteAddress"), { left: 17.0, top: 30.9, width: 45.0, fontSize: 9.5 });
  textElement(front, value(fields, "landCategory"), { left: 69.0, top: 30.9, width: 18.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "zoning"), { left: 17.0, top: 33.5, width: 45.0, fontSize: 9.5 });
  textElement(front, value(fields, "district"), { left: 69.0, top: 33.5, width: 18.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "slopeDegree"), { left: 34.0, top: 41.15, width: 19.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "soilType"), { left: 70.0, top: 41.15, width: 17.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "buriedRockVolumeM3"), { left: 34.0, top: 43.65, width: 19.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "mainTreeSpecies"), { left: 34.0, top: 46.2, width: 19.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "standingForestAreaM2"), { left: 34.0, top: 48.7, width: 19.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "unforestedAreaM2"), { left: 70.0, top: 48.7, width: 17.0, fontSize: 10, align: "center" });
  textElement(front, value(fields, "applicationAreaM2"), { left: 34.0, top: 51.2, width: 45.0, fontSize: 10 });
  textElement(front, value(fields, "purpose"), { left: 17.0, top: 68.75, width: 72.0, height: 2.2, fontSize: 10 });
  addOfficialDate(front, value(fields, "startDate"), [{ left: 28.9, width: 6.6 }, { left: 37.5, width: 3.7 }, { left: 43.2, width: 4.5 }], 71.0);
  addOfficialDate(front, value(fields, "endDate"), [{ left: 55.0, width: 7.1 }, { left: 64.0, width: 4.2 }, { left: 70.0, width: 4.2 }], 71.0);
  addOfficialDate(front, seoulToday(), [{ left: 67.4, width: 5.0 }, { left: 74.2, width: 5.7 }, { left: 81.8, width: 5.8 }], 76.15);
  textElement(front, applicantName, { left: 53.5, top: 78.05, width: 25.5, fontSize: 10, align: "center" });
  const back = createPage("portrait", "official-development-form");
  const backImage = templateAssetUrl("development-application-page-2.png");
  back.dataset.backgroundImage = backImage;
  Object.assign(back.style, {
    backgroundImage: `url("${backImage}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
  });
  return [{ element: front, orientation: "portrait" }, { element: back, orientation: "portrait" }];
}

function addTitle(page: HTMLElement, title: string, top = 46): void {
  const heading = document.createElement("h1");
  heading.textContent = title;
  Object.assign(heading.style, {
    margin: `${top}px 0 34px`,
    fontSize: "32px",
    letterSpacing: "0.32em",
    textAlign: "center",
    fontWeight: "700",
  });
  page.append(heading);
}

function createTable(headers: string[], rows: string[][], widths?: number[]): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "reference-table";
  if (widths) {
    const colgroup = document.createElement("colgroup");
    widths.forEach((width) => {
      const col = document.createElement("col");
      col.style.width = `${width}%`;
      colgroup.append(col);
    });
    table.append(colgroup);
  }
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((header) => {
    const cell = document.createElement("th");
    cell.textContent = header;
    headRow.append(cell);
  });
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((item) => {
      const cell = document.createElement("td");
      cell.textContent = item;
      tr.append(cell);
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
  return table;
}

const referenceCss = `
  .reference-pdf-page { font-size: 13px; line-height: 1.6; }
  .reference-pdf-page .content { padding: 0 58px 48px; }
  .reference-pdf-page h2 { margin: 21px 0 8px; font-size: 17px; letter-spacing: .13em; }
  .reference-pdf-page p { margin: 0 0 10px; white-space: pre-wrap; }
  .reference-pdf-page .reference-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 8px 0 18px; }
  .reference-pdf-page .reference-table th,
  .reference-pdf-page .reference-table td { border: 1.4px solid #111; padding: 7px 6px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
  .reference-pdf-page .reference-table th { font-weight: 700; background: #fff; }
  .reference-pdf-page .reference-table td { height: 34px; }
  .reference-pdf-page .reference-table tfoot td { font-weight: 700; }
  .reference-pdf-page .bullet-line { display: grid; grid-template-columns: 16px 1fr; gap: 6px; margin: 7px 0; }
  .reference-pdf-page .bullet-line::before { content: "◆"; }
  .reference-pdf-page .signature { margin-top: 42px; text-align: center; line-height: 2.25; white-space: pre-wrap; }
`;

function buildAreaStatementPage(caseRecord: CaseRecord): ReferencePdfPage[] {
  const page = createPage("landscape", "area-statement-page");
  appendStyle(page, `${referenceCss}
    .area-statement-page { padding: 40px 48px; }
    .area-statement-page h1 { margin: 15px 0 26px; font-size: 31px; letter-spacing: .35em; text-align: center; }
    .area-statement-page .unit { margin: -20px 0 7px; text-align: right; font-weight: 700; }
    .area-statement-page .reference-table th { height: 58px; font-size: 13px; }
    .area-statement-page .reference-table td { height: 67px; font-size: 13px; }
  `);
  addTitle(page, "개발행위허가면적조서", 15);
  const unit = document.createElement("div");
  unit.className = "unit";
  unit.textContent = "단위: ㎡";
  page.append(unit);
  const rows = caseRecord.parcels.map((parcel) => [
    parcel.address,
    parcel.lotNumber || "-",
    parcel.category || "-",
    compactArea(parcel.ledgerAreaM2),
    compactArea(parcel.plannedAreaM2),
    compactArea(parcel.roadOccupancyAreaM2),
    compactArea(parcel.excludedAreaM2),
    parcel.ownerNames.join(", ") || "확인 필요",
    parcel.role === "project-site" ? caseRecord.projectPurpose : parcel.role === "road-occupancy" ? "도로점용" : "",
  ]);
  const total = (key: "ledgerAreaM2" | "plannedAreaM2" | "roadOccupancyAreaM2" | "excludedAreaM2") => compactArea(caseRecord.parcels.reduce((sum, parcel) => sum + (parcel[key] ?? 0), 0));
  rows.push(["합계", `${caseRecord.parcels.length}필지`, "", total("ledgerAreaM2"), total("plannedAreaM2"), total("roadOccupancyAreaM2"), total("excludedAreaM2"), "", ""]);
  page.append(createTable(
    ["토지 소재지", "지번", "지목", "지적", "사업부지", "도로점용", "제외면적", "소유자", "비고"],
    rows,
    [23, 8, 7, 9, 10, 9, 9, 13, 12],
  ));
  return [{ element: page, orientation: "landscape" }];
}

function section(page: HTMLElement, number: string, title: string, body: string): void {
  const heading = document.createElement("h2");
  heading.textContent = `${number}. ${title}`;
  page.append(heading);
  const paragraph = document.createElement("p");
  paragraph.textContent = body || "해당사항 없음.";
  page.append(paragraph);
}

function addContent(page: HTMLElement): HTMLElement {
  const content = document.createElement("div");
  content.className = "content";
  page.append(content);
  return content;
}

function buildBusinessPlanPages(caseRecord: CaseRecord, model: CaseDocumentModel): ReferencePdfPage[] {
  const fields = fieldMap(model);
  const party = applicant(caseRecord);
  const pages: ReferencePdfPage[] = [];
  const makePage = () => {
    const page = createPage("portrait", "business-plan-page");
    appendStyle(page, `${referenceCss}
      .business-plan-page h1 { margin-bottom: 30px; }
      .business-plan-page .content { font-size: 13px; line-height: 1.75; }
      .business-plan-page h2 { margin-top: 16px; }
      .business-plan-page .reference-table th, .business-plan-page .reference-table td { padding: 6px 5px; }
    `);
    pages.push({ element: page, orientation: "portrait" });
    return page;
  };

  const first = makePage();
  addTitle(first, "사업계획서", 52);
  const firstContent = addContent(first);
  section(firstContent, "1", "위치 및 현황", value(fields, "overview"));
  section(firstContent, "2", "사업 목적", value(fields, "purpose", caseRecord.projectPurpose));
  section(firstContent, "3", "사업 시행자", [
    `성명·명칭: ${value(fields, "implementer", party?.name || caseRecord.applicantName)}`,
    `생년월일·법인등록번호: ${party?.registrationNumber || ""}`,
    `주소: ${party?.address || ""}`,
  ].join("\n"));
  section(firstContent, "4", "사업 시행 기간", `착공: ${formatKoreanDate(caseRecord.projectPeriod.start)}\n준공: ${formatKoreanDate(caseRecord.projectPeriod.end)}`);
  const costTitle = document.createElement("h2");
  costTitle.textContent = "5. 자금 소요 및 조달 계획";
  firstContent.append(costTitle);
  const costRows = caseRecord.costItems.map((item) => {
    const amount = item.quantity * item.unitPrice;
    return [item.workType || "공사비", amount.toLocaleString("ko-KR"), amount.toLocaleString("ko-KR"), "-", item.specification || "자기자금"];
  });
  if (!costRows.length) costRows.push(["공사비", "-", "-", "-", value(fields, "fundingPlan")]);
  firstContent.append(createTable(["구분", "소요자금(원)", "자기자금(원)", "지원자금(원)", "비고"], costRows, [22, 18, 18, 18, 24]));

  const second = makePage();
  const secondContent = addContent(second);
  const landTitle = document.createElement("h2");
  landTitle.textContent = "6. 토지조서";
  secondContent.append(landTitle);
  secondContent.append(createTable(
    ["토지 소재지", "지목", "지적", "사업부지", "도로점용", "소유자", "비고"],
    model.parcels.map((parcel) => [parcel.address, caseRecord.parcels.find((item) => item.address === parcel.address)?.category || "-", parcel.ledgerArea, parcel.plannedArea, parcel.roadArea, parcel.owner, parcel.role]),
    [26, 8, 10, 11, 11, 16, 18],
  ));
  section(secondContent, "7", "공사 개요", value(fields, "constructionSummary", caseRecord.constructionSummary));
  section(secondContent, "8", "사업 개요", `대지 위치: ${model.parcels.map((parcel) => parcel.address).join(", ")}\n도시계획: ${model.parcels.flatMap((parcel) => parcel.zoning).join(", ")}\n대지면적: ${model.parcels.map((parcel) => parcel.plannedArea).join(", ")}\n사업목적: ${caseRecord.projectPurpose}`);

  const third = makePage();
  const thirdContent = addContent(third);
  section(thirdContent, "9", "도로계획 및 배수계획", [value(fields, "roadPlan"), value(fields, "drainagePlan")].filter(Boolean).join("\n"));
  section(thirdContent, "10", "피해 방지 계획", value(fields, "preventionPlan", caseRecord.environmentPlan));
  section(thirdContent, "11", "급수 계획", value(fields, "waterSupplyPlan"));
  section(thirdContent, "12", "토사 처리 계획", value(fields, "earthworkPlan"));
  section(thirdContent, "13", "대기환경보전법 관련 사항", value(fields, "airReview"));
  section(thirdContent, "14", "물환경보전법 관련 사항", value(fields, "waterReview"));
  section(thirdContent, "15", "인근에 미치는 영향", value(fields, "nearbyImpactPlan"));
  section(thirdContent, "16", "부산물 및 입목 처리 계획", value(fields, "vegetationPlan"));
  section(thirdContent, "17", "소음·분진·오폐수·세륜·교통 방지계획", [value(fields, "noiseDustPlan"), value(fields, "wastewaterPlan"), value(fields, "trafficPlan")].filter(Boolean).join("\n"));

  const fourth = makePage();
  const fourthContent = addContent(fourth);
  section(fourthContent, "18", "폐기물 처리 대책", value(fields, "wastePlan"));
  section(fourthContent, "19", "사후 관리", value(fields, "postManagementPlan"));
  return pages;
}

function bullet(page: HTMLElement, body: string): void {
  const line = document.createElement("div");
  line.className = "bullet-line";
  const text = document.createElement("span");
  text.textContent = body;
  line.append(text);
  page.append(line);
}

function buildDamagePreventionPage(caseRecord: CaseRecord, model: CaseDocumentModel): ReferencePdfPage[] {
  const fields = fieldMap(model);
  const party = applicant(caseRecord);
  const page = createPage("portrait", "damage-prevention-page");
  appendStyle(page, `${referenceCss}
    .damage-prevention-page .content { padding: 0 66px 42px; font-size: 13px; line-height: 1.75; }
    .damage-prevention-page .summary { margin-bottom: 28px; font-weight: 700; }
    .damage-prevention-page .plan-title { margin: 25px 0 22px; font-size: 25px; letter-spacing: .28em; text-align: center; }
    .damage-prevention-page .numbered { margin: 13px 0; }
    .damage-prevention-page .numbered strong { margin-right: 8px; }
    .damage-prevention-page .signature { margin-top: 34px; text-align: right; }
  `);
  addTitle(page, "피해방지계획서", 49);
  const content = addContent(page);
  const summary = document.createElement("div");
  summary.className = "summary";
  bullet(summary, `사업장의 위치: ${value(fields, "siteAddress")}`);
  bullet(summary, `전용 목적: ${value(fields, "purpose", caseRecord.projectPurpose)}`);
  bullet(summary, `사업장의 면적: ${value(fields, "area")}㎡`);
  content.append(summary);
  const planTitle = document.createElement("h2");
  planTitle.className = "plan-title";
  planTitle.textContent = "■ 피해방지계획 ■";
  content.append(planTitle);
  [
    ["1", value(fields, "siteSafety", caseRecord.safetyPlan)],
    ["2", value(fields, "soilRunoff")],
    ["3", value(fields, "dust")],
    ["4", value(fields, "traffic")],
    ["5", value(fields, "drainage")],
    ["6", value(fields, "additional")],
    ["7", "상기 사항 외에도 피해방지 등이 필요하다고 인정될 경우 적절한 조치를 취하겠습니다."],
  ].forEach(([number, body]) => {
    const row = document.createElement("p");
    row.className = "numbered";
    const strong = document.createElement("strong");
    strong.textContent = `${number}.`;
    row.append(strong, document.createTextNode(String(body) || "해당사항 없음."));
    content.append(row);
  });
  const signature = document.createElement("div");
  signature.className = "signature";
  signature.textContent = `${formatKoreanDate(new Date().toISOString())}\n주소: ${party?.address || ""}\n성명·명칭: ${party?.name || caseRecord.applicantName}\n생년월일·법인등록번호: ${party?.registrationNumber || ""}`;
  content.append(signature);
  return [{ element: page, orientation: "portrait" }];
}

export function buildReferencePdfPages(caseRecord: CaseRecord, model: CaseDocumentModel): ReferencePdfPage[] | null {
  switch (model.templateId) {
    case "development-application":
      return buildDevelopmentApplicationPages(caseRecord, model);
    case "area-statement":
      return buildAreaStatementPage(caseRecord);
    case "business-plan":
      return buildBusinessPlanPages(caseRecord, model);
    case "damage-prevention-plan":
      return buildDamagePreventionPage(caseRecord, model);
    default:
      return null;
  }
}

