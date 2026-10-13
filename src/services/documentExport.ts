import type { CaseRecord } from "../types";
import { buildCaseDocumentModels, type CaseDocumentModel } from "../domain/documentModel";
import { formatSeoulDate } from "../domain/date";

const bodyFont = "NanumGothic";

async function loadDocxFont(): Promise<Uint8Array> {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const response = await fetch(new URL("fonts/NanumGothic.ttf", baseUrl));
  if (!response.ok) throw new Error("DOCX 한글 글꼴을 불러오지 못했습니다.");
  return new Uint8Array(await response.arrayBuffer());
}

function fileBaseName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

export async function exportCaseDocx(caseRecord: CaseRecord): Promise<void> {
  const [docxModule, fileSaverModule, fontData] = await Promise.all([
    import("docx"),
    import("file-saver"),
    loadDocxFont(),
  ]);
  const {
    AlignmentType,
    CharacterSet,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = docxModule;
  const { saveAs } = fileSaverModule;
  const models = buildCaseDocumentModels(caseRecord);
  if (!models.length) throw new Error("출력에 포함할 문서를 1개 이상 선택해 주세요.");

  const tableCell = (text: string, isHeader = false) => new TableCell({
    shading: isHeader ? { type: ShadingType.SOLID, fill: "004541", color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: isHeader, color: isHeader ? "FFFFFF" : "0C1C2E", font: bodyFont, size: 18 })],
    })],
  });
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];

  models.forEach((model, modelIndex) => {
    children.push(
      new Paragraph({
        text: model.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        pageBreakBefore: modelIndex > 0,
        spacing: { after: 180 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: model.statusLabel, bold: true, color: "006B63", font: bodyFont, size: 19 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: `${model.templateVersion} · 문서 v${model.version} · ${model.author} · ${formatSeoulDate(model.createdAt)}`,
          color: "475467",
          font: bodyFont,
          size: 17,
        })],
        spacing: { after: 260 },
      }),
    );

    model.sections.forEach((section) => {
      children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 240, after: 100 } }));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: [tableCell("항목", true), tableCell("작성 내용", true)] }),
          ...section.fields.map((field) => new TableRow({ children: [
            tableCell(`${field.label}${field.required ? " *" : ""}`),
            tableCell(field.value),
          ] })),
        ],
      }));
    });

    children.push(new Paragraph({ text: "대상 필지 및 면적", heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 280, after: 100 } }));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [tableCell("지번·주소", true), tableCell("역할", true), tableCell("대장", true), tableCell("실측", true), tableCell("계획", true), tableCell("도로", true), tableCell("제외", true), tableCell("소유자", true)] }),
        ...model.parcels.map((parcel) => new TableRow({ children: [
          tableCell(parcel.address), tableCell(parcel.role), tableCell(parcel.ledgerArea), tableCell(parcel.surveyedArea),
          tableCell(parcel.plannedArea), tableCell(parcel.roadArea), tableCell(parcel.excludedArea), tableCell(parcel.owner),
        ] })),
      ],
    }));

    children.push(new Paragraph({ text: "허가 및 관련 절차", heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 280, after: 100 } }));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [tableCell("절차", true), tableCell("관계", true), tableCell("신청", true), tableCell("기존 허가번호", true), tableCell("검토", true)] }),
        ...model.permits.map((permit) => new TableRow({ children: [
          tableCell(permit.name), tableCell(permit.relation), tableCell(permit.application), tableCell(permit.existingPermit), tableCell(permit.review),
        ] })),
      ],
    }));

    children.push(new Paragraph({
      text: "첨부 목록",
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      pageBreakBefore: ["business-plan", "damage-prevention-plan"].includes(model.templateId),
      spacing: { before: 280, after: 100 },
    }));
    if (model.attachments.length) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: [tableCell("파일명", true), tableCell("역할", true), tableCell("버전", true)] }),
          ...model.attachments.map((attachment) => new TableRow({ children: [tableCell(attachment.name), tableCell(attachment.role), tableCell(attachment.version)] })),
        ],
      }));
    } else {
      children.push(new Paragraph({ text: "등록된 첨부가 없습니다." }));
    }

    children.push(
      new Paragraph({ text: "서식·데이터 출처", heading: HeadingLevel.HEADING_1, spacing: { before: 160, after: 60 } }),
      ...model.sources.map((source) => new Paragraph({ text: source, bullet: { level: 0 } })),
      new Paragraph({
        children: [new TextRun({ text: model.notice, bold: true, color: "344054", font: bodyFont, size: 18 })],
        spacing: { before: 60 },
      }),
    );
  });

  const version = models[0].version;
  const document = new Document({
    creator: caseRecord.assigneeName,
    title: `${caseRecord.title} 제출서류 묶음`,
    description: "선택한 신청서와 사업계획서 편집본",
    fonts: [{ name: bodyFont, data: fontData as never, characterSet: CharacterSet.HANGUL }],
    styles: {
      default: { document: { run: { font: bodyFont, size: 20, color: "0C1C2E" } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: bodyFont, size: 36, bold: true, color: "000000" } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: bodyFont, size: 24, bold: true, color: "000000" }, paragraph: { spacing: { before: 280, after: 120 } } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 900, right: 760, bottom: 900, left: 760 },
        },
      },
      children,
    }],
  });
  const blob = await Packer.toBlob(document);
  saveAs(blob, `${fileBaseName(caseRecord.title)}_제출서류묶음_v${version}.docx`);
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, value: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function appendTable(parent: HTMLElement, headers: string[], rows: string[][]): void {
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach((header) => appendText(headerRow, "th", header));
  head.append(headerRow);
  const body = document.createElement("tbody");
  rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    row.forEach((cell) => appendText(tableRow, "td", cell));
    body.append(tableRow);
  });
  table.append(head, body);
  parent.append(table);
}

function appendPdfBlock(parent: HTMLElement, build: (block: HTMLElement) => void, className = ""): void {
  const block = document.createElement("section");
  block.className = `pdf-block ${className}`.trim();
  build(block);
  parent.append(block);
}

function appendPdfModel(page: HTMLElement, model: CaseDocumentModel, isFirst: boolean): void {
  appendPdfBlock(page, (block) => {
    appendText(block, "h1", model.title);
    appendText(block, "p", model.statusLabel, "pdf-status");
    appendText(block, "p", `${model.templateVersion} · 문서 v${model.version} · 작성자 ${model.author} · 생성 ${formatSeoulDate(model.createdAt)}`, "pdf-meta");
  }, isFirst ? "pdf-document-start first" : "pdf-document-start");
  model.sections.forEach((section) => {
    appendPdfBlock(page, (block) => {
      appendText(block, "h2", section.title);
      appendTable(block, ["항목", "작성 내용"], section.fields.map((field) => [`${field.label}${field.required ? " *" : ""}`, field.value]));
    });
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "대상 필지 및 면적");
    appendTable(block, ["지번·주소", "역할", "대장", "실측", "계획", "도로", "제외", "소유자"], model.parcels.map((parcel) => [parcel.address, parcel.role, parcel.ledgerArea, parcel.surveyedArea, parcel.plannedArea, parcel.roadArea, parcel.excludedArea, parcel.owner]));
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "허가 및 관련 절차");
    appendTable(block, ["절차", "관계", "신청", "기존 허가번호", "검토"], model.permits.map((permit) => [permit.name, permit.relation, permit.application, permit.existingPermit, permit.review]));
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "첨부 목록");
    if (model.attachments.length) appendTable(block, ["파일명", "역할", "버전"], model.attachments.map((item) => [item.name, item.role, item.version]));
    else appendText(block, "p", "등록된 첨부가 없습니다.");
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "서식·데이터 출처");
    model.sources.forEach((source) => appendText(block, "p", `• ${source}`));
    appendText(block, "p", model.notice, "pdf-notice");
  });
}

function buildPdfElement(caseRecord: CaseRecord, model: CaseDocumentModel): HTMLElement {
  const page = document.createElement("article");
  page.className = "pdf-export-page";
  Object.assign(page.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "794px",
    padding: "64px",
    background: "#ffffff",
    color: "#0c1c2e",
    fontFamily: '"Noto Sans KR", sans-serif',
    fontSize: "13px",
    lineHeight: "1.55",
    zIndex: "-1",
    boxSizing: "border-box",
  });
  appendPdfModel(page, model, true);
  const style = document.createElement("style");
  style.textContent = `
    .pdf-export-page h1 { margin: 0 0 7px; font-size: 29px; color: #000; text-align: center; }
    .pdf-export-page .pdf-status { margin: 0; color: #006b63; font-weight: 800; text-align: center; }
    .pdf-export-page .pdf-block { display: flow-root; break-inside: avoid; }
    .pdf-export-page h2 { margin: 24px 0 9px; font-size: 18px; color: #000; }
    .pdf-export-page p { margin: 5px 0; }
    .pdf-export-page .pdf-meta { color: #667085; margin: 4px 0 22px; text-align: center; }
    .pdf-export-page table { width: 100%; border-collapse: collapse; margin: 7px 0 14px; table-layout: fixed; }
    .pdf-export-page th { background: #004541; color: white; text-align: left; padding: 8px; font-weight: 700; }
    .pdf-export-page td { border: 1px solid #d9d9d9; padding: 8px; vertical-align: top; overflow-wrap: anywhere; }
    .pdf-export-page tr:nth-child(even) td { background: #f4f8f8; }
    .pdf-export-page .pdf-notice { margin-top: 20px; font-weight: 700; color: #344054; }
  `;
  page.append(style);
  page.dataset.caseTitle = caseRecord.title;
  document.body.append(page);
  return page;
}

function paginatePdfElement(element: HTMLElement): number {
  const pageHeight = element.offsetWidth * (297 / 210);
  const pageMargin = 64;
  const usableHeight = pageHeight - pageMargin * 2;
  const blocks = Array.from(element.querySelectorAll<HTMLElement>(".pdf-block"));
  blocks.forEach((block) => {
    const offsetOnPage = block.offsetTop % pageHeight;
    const remaining = pageHeight - offsetOnPage - pageMargin;
    if (offsetOnPage > pageMargin && block.offsetHeight > remaining && block.offsetHeight < usableHeight) {
      block.style.marginTop = `${Number.parseFloat(block.style.marginTop || "0") + pageHeight - offsetOnPage + pageMargin}px`;
    }
  });
  const pageCount = Math.max(1, Math.ceil(element.scrollHeight / pageHeight));
  element.style.height = `${Math.ceil(pageCount * pageHeight)}px`;
  return pageCount;
}

export async function exportCasePdf(caseRecord: CaseRecord): Promise<void> {
  const models = buildCaseDocumentModels(caseRecord);
  if (!models.length) throw new Error("출력에 포함할 문서를 1개 이상 선택해 주세요.");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  await document.fonts.ready;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let outputPageIndex = 0;

  for (const model of models) {
    const element = buildPdfElement(caseRecord, model);
    try {
      const pageCount = paginatePdfElement(element);
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      const image = canvas.toDataURL("image/jpeg", 0.94);

      for (let modelPageIndex = 0; modelPageIndex < pageCount; modelPageIndex += 1) {
        if (outputPageIndex > 0) pdf.addPage();
        pdf.addImage(image, "JPEG", 0, -modelPageIndex * pageHeight, pageWidth, imageHeight, undefined, "FAST");
        outputPageIndex += 1;
      }
    } finally {
      element.remove();
    }
  }

  pdf.save(`${fileBaseName(caseRecord.title)}_제출서류묶음_v${models[0].version}.pdf`);
}
