import type { CaseDocumentModel } from "../domain/documentModel";
import type { CaseRecord, PartyRecord } from "../types";

export type PdfPageOrientation = "portrait" | "landscape";

export interface ReferencePdfPage {
  element: HTMLElement;
  orientation: PdfPageOrientation;
}

const portraitSize = { width: 794, height: 1123 };
const landscapeSize = { width: 1123, height: 794 };
export const pdfFontFamily = "SeolgyeNanumGothic";

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
    fontFamily: `"${pdfFontFamily}", "NanumGothic", "Noto Sans KR", sans-serif`,
    fontSynthesis: "none",
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
    wordBreak: "keep-all",
    boxSizing: "border-box",
  });
  page.append(element);
  return element;
}

function developmentValue(
  page: HTMLElement,
  fieldId: string,
  content: string,
  options: {
    left: number;
    top: number;
    width: number;
    height?: number;
    fontSize?: number;
    minFontSize?: number;
    maxLines?: number;
    align?: "left" | "center" | "right";
    weight?: number;
    lineHeight?: number;
  },
): HTMLElement {
  const preferredFontSize = options.fontSize ?? 12.2;
  const visualLength = Array.from(content).reduce((sum, character) => sum + (/^[\x00-\x7F]$/.test(character) ? 0.56 : 1), 0);
  const availableWidth = portraitSize.width * (options.width / 100);
  const maxLines = options.maxLines ?? 1;
  const estimatedCapacity = (availableWidth / (preferredFontSize * 0.94)) * maxLines;
  const fittedFontSize = visualLength > estimatedCapacity
    ? Math.max(options.minFontSize ?? 9.2, preferredFontSize * (estimatedCapacity / visualLength))
    : preferredFontSize;
  const element = textElement(page, content, {
    ...options,
    fontSize: fittedFontSize,
    weight: options.weight ?? 500,
    lineHeight: options.lineHeight ?? 1.15,
  });
  element.dataset.pdfField = fieldId;
  Object.assign(element.style, {
    color: "#000000",
    letterSpacing: "-0.012em",
    textRendering: "geometricPrecision",
  });
  if (options.height) {
    const span = document.createElement("span");
    span.textContent = element.textContent;
    span.style.width = "100%";
    element.textContent = "";
    element.append(span);
    Object.assign(element.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: options.align === "center" ? "center" : options.align === "right" ? "flex-end" : "flex-start",
    });
  }
  return element;
}

function developmentSiteAddress(caseRecord: CaseRecord, fields: Map<string, string>): string {
  const draft = caseRecord.documentDrafts.find((item) => item.templateId === "development-application");
  if (draft && Object.prototype.hasOwnProperty.call(draft.overrides, "siteAddress")) {
    return value(fields, "siteAddress");
  }

  const addresses = caseRecord.parcels
    .map((parcel) => parcel.address.trim())
    .filter((address, index, items) => address && items.indexOf(address) === index);
  if (addresses.length <= 1) return addresses[0] ?? value(fields, "siteAddress");
  return `${addresses[0]} 외 ${addresses.length - 1}필지`;
}

function addDevelopmentDate(
  page: HTMLElement,
  fieldId: string,
  source: string,
  positions: Array<{ left: number; width: number }>,
  top: number,
): void {
  koreanDateParts(source).forEach((part, index) => {
    developmentValue(page, `${fieldId}-${index}`, part, {
      ...positions[index],
      top,
      height: 1.45,
      fontSize: 11.3,
      minFontSize: 10,
      align: "right",
      weight: 680,
    });
  });
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
    ["공작물설치", 11.3],
    ["토지형질변경", 26.3],
    ["토석채취", 44.15],
    ["토지분할", 59.2],
    ["물건적치", 74.35],
  ].forEach(([label, left]) => {
    if (actionSelected(actionTypes, String(label))) developmentValue(front, `action-${String(label)}`, "✓", { left: Number(left), top: 16.48, width: 2.6, height: 1.9, fontSize: 15, minFontSize: 15, weight: 850, align: "center" });
  });

  const applicantName = [value(fields, "applicantName"), value(fields, "representativeName")].filter(Boolean).join(" / ");
  developmentValue(front, "applicantName", applicantName, { left: 16.2, top: 21.05, width: 44.2, height: 1.65, fontSize: 12.4, minFontSize: 10.2, align: "center" });
  developmentValue(front, "registrationNumber", value(fields, "registrationNumber"), { left: 61.2, top: 21.05, width: 28.7, height: 1.65, fontSize: 12.2, minFontSize: 10.2, align: "center" });
  developmentValue(front, "applicantAddress", value(fields, "applicantAddress"), { left: 16.2, top: 24.35, width: 35.2, height: 2.45, fontSize: 11.6, minFontSize: 9.5, maxLines: 2, lineHeight: 1.12 });
  developmentValue(front, "applicantPhone", value(fields, "applicantPhone"), { left: 71.5, top: 25.25, width: 17.5, height: 1.45, fontSize: 12.1, minFontSize: 10.2, align: "center" });
  developmentValue(front, "siteAddress", developmentSiteAddress(caseRecord, fields), { left: 18.2, top: 30.4, width: 45.7, height: 2.45, fontSize: 11.4, minFontSize: 9.8, maxLines: 2, lineHeight: 1.1 });
  developmentValue(front, "landCategory", value(fields, "landCategory"), { left: 70.1, top: 30.55, width: 18.8, height: 2.1, fontSize: 12, minFontSize: 10, align: "center" });
  developmentValue(front, "zoning", value(fields, "zoning"), { left: 18.2, top: 33.0, width: 45.7, height: 2.25, fontSize: 11.8, minFontSize: 9.6, maxLines: 2, lineHeight: 1.1 });
  developmentValue(front, "district", value(fields, "district"), { left: 70.1, top: 33.1, width: 18.8, height: 2.1, fontSize: 12, minFontSize: 10, align: "center" });
  developmentValue(front, "slopeDegree", value(fields, "slopeDegree"), { left: 43.0, top: 40.75, width: 20.3, height: 2.15, fontSize: 12.2, minFontSize: 10.5, align: "center" });
  developmentValue(front, "soilType", value(fields, "soilType"), { left: 76.0, top: 40.75, width: 13.0, height: 2.15, fontSize: 12.2, minFontSize: 10.5, align: "center" });
  developmentValue(front, "buriedRockVolumeM3", value(fields, "buriedRockVolumeM3"), { left: 43.0, top: 43.25, width: 20.3, height: 2.15, fontSize: 12.2, minFontSize: 10.5, align: "center" });
  developmentValue(front, "mainTreeSpecies", value(fields, "mainTreeSpecies"), { left: 43.0, top: 45.75, width: 20.3, height: 2.2, fontSize: 12.2, minFontSize: 10.2, align: "center" });
  developmentValue(front, "standingForestAreaM2", value(fields, "standingForestAreaM2"), { left: 43.0, top: 48.3, width: 20.3, height: 2.15, fontSize: 12.2, minFontSize: 10.5, align: "center" });
  developmentValue(front, "unforestedAreaM2", value(fields, "unforestedAreaM2"), { left: 76.0, top: 48.3, width: 13.0, height: 2.15, fontSize: 12.2, minFontSize: 10.5, align: "center" });
  developmentValue(front, "applicationAreaM2", value(fields, "applicationAreaM2"), { left: 43.0, top: 50.85, width: 20.3, height: 2.15, fontSize: 12.2, minFontSize: 10.5, align: "center" });
  developmentValue(front, "purpose", value(fields, "purpose"), { left: 24.8, top: 68.38, width: 64.0, height: 2.05, fontSize: 11.5, minFontSize: 9.5, maxLines: 2, lineHeight: 1.08 });
  addDevelopmentDate(front, "startDate", value(fields, "startDate"), [{ left: 28.9, width: 6.6 }, { left: 37.5, width: 3.7 }, { left: 43.2, width: 4.5 }], 71.05);
  addDevelopmentDate(front, "endDate", value(fields, "endDate"), [{ left: 55.0, width: 7.1 }, { left: 64.0, width: 4.2 }, { left: 70.0, width: 4.2 }], 71.05);
  addDevelopmentDate(front, "applicationDate", seoulToday(), [{ left: 67.4, width: 5.0 }, { left: 74.2, width: 5.7 }, { left: 81.8, width: 5.8 }], 75.95);
  developmentValue(front, "applicantSignature", applicantName, { left: 53.5, top: 77.7, width: 25.5, height: 1.7, fontSize: 11.5, minFontSize: 9.5, align: "center" });
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

function buildForestApplicationPages(model: CaseDocumentModel): ReferencePdfPage[] {
  const fields = fieldMap(model);
  const front = createPage("portrait", "official-forest-form");
  const frontImage = templateAssetUrl("forest-application-page-1.png");
  front.dataset.backgroundImage = frontImage;
  Object.assign(front.style, {
    backgroundImage: `url("${frontImage}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
  });

  const applicationKind = value(fields, "applicationKind");
  if (applicationKind === "new") {
    textElement(front, "✓", { left: 41, top: 2.35, width: 3, fontSize: 14, weight: 800, align: "center" });
    textElement(front, "✓", { left: 35.3, top: 65.45, width: 2.5, fontSize: 12, weight: 800, align: "center" });
  }
  if (applicationKind === "change") {
    textElement(front, "✓", { left: 41, top: 4.75, width: 3, fontSize: 14, weight: 800, align: "center" });
    textElement(front, "✓", { left: 42.8, top: 65.45, width: 2.5, fontSize: 12, weight: 800, align: "center" });
  }

  [
    ["applicantName", 21.3, 13.3, 44],
    ["registrationNumber", 67, 13.3, 21],
    ["applicantAddress", 21.3, 16.25, 44],
    ["applicantPhone", 67, 16.25, 21],
    ["forestRightRelation", 21.3, 19.45, 67],
    ["ownerName", 21.3, 23.15, 44],
    ["ownerBirthDate", 67, 23.15, 21],
    ["ownerAddress", 21.3, 26.15, 44],
    ["ownerPhone", 67, 26.15, 21],
  ].forEach(([id, left, top, width]) => {
    textElement(front, value(fields, String(id)), { left: Number(left), top: Number(top), width: Number(width), fontSize: 9.2, align: "center" });
  });

  [34.55, 37.35, 39.85].forEach((top, index) => {
    const row = index + 1;
    [
      [`forestParcel${row}Address`, 21, 16],
      [`forestParcel${row}LotNumber`, 37.6, 8.7],
      [`forestParcel${row}Category`, 47.2, 8.4],
      [`forestParcel${row}AreaTotalM2`, 56.4, 8.6],
      [`forestParcel${row}ForestryAreaM2`, 65.5, 8.1],
      [`forestParcel${row}PublicAreaM2`, 74.2, 7.6],
      [`forestParcel${row}SemiConservationAreaM2`, 82.2, 7.5],
    ].forEach(([id, left, width]) => {
      textElement(front, value(fields, String(id)), { left: Number(left), top, width: Number(width), fontSize: 8.1, align: "center" });
    });
  });

  [
    ["fellSpecies", 21.4, 6.9],
    ["fellCount", 28.5, 6.7],
    ["fellVolumeM3", 35.7, 6.2],
    ["excavatedSpecies", 42.2, 6.8],
    ["excavatedCount", 49.2, 6.7],
    ["excavatedVolumeM3", 56, 6.2],
    ["stoneTotalM3", 62.6, 6.1],
    ["stoneMaterialM3", 68.9, 6.1],
    ["soilM3", 75.5, 13.5],
  ].forEach(([id, left, width]) => {
    textElement(front, value(fields, String(id)), { left: Number(left), top: 46.7, width: Number(width), fontSize: 8.1, align: "center" });
  });

  textElement(front, value(fields, "purpose"), { left: 21.3, top: 50.9, width: 31, height: 2.7, fontSize: 8.7, align: "center" });
  const period = [formatKoreanDate(value(fields, "startDate")), formatKoreanDate(value(fields, "endDate"))].filter(Boolean).join(" ~ ");
  textElement(front, period, { left: 68.3, top: 50.9, width: 20.7, height: 2.7, fontSize: 8.1, align: "center" });

  const payment = value(fields, "replacementForestChargePayment");
  if (payment === "before-permit") textElement(front, "✓", { left: 22.9, top: 52.8, width: 2.4, fontSize: 12, weight: 800, align: "center" });
  if (payment === "after-permit-conditional") textElement(front, "✓", { left: 22.9, top: 54.7, width: 2.4, fontSize: 12, weight: 800, align: "center" });

  [
    ["previousDescription", 21.2, 22],
    ["changedDescription", 43.8, 23],
    ["changeReason", 68.3, 20.5],
  ].forEach(([id, left, width]) => {
    textElement(front, value(fields, String(id)), { left: Number(left), top: 60.1, width: Number(width), height: 3.4, fontSize: 8.2, align: "center" });
  });

  addOfficialDate(front, value(fields, "applicationDate") || seoulToday(), [
    { left: 77, width: 4.2 }, { left: 82.7, width: 3.1 }, { left: 88, width: 3.1 },
  ], 69.1);
  textElement(front, value(fields, "signerName"), { left: 52.5, top: 72, width: 27, fontSize: 9.2, align: "center" });

  const back = createPage("portrait", "official-forest-form");
  const backImage = templateAssetUrl("forest-application-page-2.png");
  back.dataset.backgroundImage = backImage;
  Object.assign(back.style, {
    backgroundImage: `url("${backImage}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
  });
  if (value(fields, "consentToLivestockRegistrationLookup") === "yes") {
    textElement(back, value(fields, "consentSignerName"), { left: 55, top: 95, width: 28, fontSize: 9.2, align: "center" });
  }
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
    case "forest-application":
      return buildForestApplicationPages(model);
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

