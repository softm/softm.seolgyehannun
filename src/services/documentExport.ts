import type { CaseRecord } from "../types";
import { buildCaseDocumentModel } from "../domain/documentModel";
import { formatSeoulDate } from "../domain/date";

const bodyFont = "Noto Sans KR";

function fileBaseName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

export async function exportCaseDocx(caseRecord: CaseRecord): Promise<void> {
  const [docxModule, fileSaverModule] = await Promise.all([import("docx"), import("file-saver")]);
  const {
    AlignmentType,
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
  const tableCell = (text: string, isHeader = false) => new TableCell({
    shading: isHeader ? { type: ShadingType.SOLID, fill: "004541", color: "auto" } : undefined,
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: isHeader, color: isHeader ? "FFFFFF" : "0C1C2E", font: bodyFont, size: 20 })],
    })],
  });
  const model = buildCaseDocumentModel(caseRecord);
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({
      text: model.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `문서 버전 ${model.version} · 작성자 ${model.author} · 생성 ${formatSeoulDate(model.createdAt)}`,
        color: "475467",
        font: bodyFont,
        size: 19,
      })],
      spacing: { after: 360 },
    }),
    new Paragraph({ text: "대상 필지", heading: HeadingLevel.HEADING_1 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [tableCell("주소", true), tableCell("PNU", true), tableCell("대장면적", true), tableCell("용도지역", true)] }),
        ...model.parcels.map((parcel) => new TableRow({ children: [
          tableCell(parcel.address), tableCell(parcel.pnu), tableCell(parcel.area), tableCell(parcel.zoning),
        ] })),
      ],
    }),
    new Paragraph({ text: "허가 및 관련 절차", heading: HeadingLevel.HEADING_1, spacing: { before: 320 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [tableCell("절차", true), tableCell("관계", true), tableCell("신청", true), tableCell("검토", true)] }),
        ...model.permits.map((permit) => new TableRow({ children: [
          tableCell(permit.name), tableCell(permit.relation), tableCell(permit.application), tableCell(permit.review),
        ] })),
      ],
    }),
  ];

  model.sections.forEach((section) => {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, spacing: { before: 320 } }));
    section.paragraphs.forEach((text) => children.push(new Paragraph({
      children: [new TextRun({ text, font: bodyFont, size: 22 })],
      spacing: { after: 140, line: 360 },
    })));
  });

  children.push(new Paragraph({ text: "첨부 목록", heading: HeadingLevel.HEADING_1, spacing: { before: 320 } }));
  if (model.attachments.length) {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [tableCell("파일명", true), tableCell("역할", true), tableCell("버전", true)] }),
        ...model.attachments.map((attachment) => new TableRow({ children: [
          tableCell(attachment.name), tableCell(attachment.role), tableCell(attachment.version),
        ] })),
      ],
    }));
  } else {
    children.push(new Paragraph({ text: "등록된 첨부가 없습니다." }));
  }

  children.push(
    new Paragraph({ text: "출처 및 작성 정보", heading: HeadingLevel.HEADING_1, spacing: { before: 320 } }),
    ...model.sources.map((source) => new Paragraph({ text: source, bullet: { level: 0 } })),
    new Paragraph({
      children: [new TextRun({ text: model.notice, bold: true, color: "344054", font: bodyFont, size: 19 })],
      spacing: { before: 280 },
    }),
  );

  const document = new Document({
    creator: model.author,
    title: model.title,
    description: model.notice,
    styles: {
      default: { document: { run: { font: bodyFont, size: 22, color: "0C1C2E" } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: bodyFont, size: 38, bold: true, color: "000000" } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: bodyFont, size: 27, bold: true, color: "000000" }, paragraph: { spacing: { before: 320, after: 160 } } },
      ],
    },
    sections: [{
      properties: {
        page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      },
      children,
    }],
  });
  const blob = await Packer.toBlob(document);
  saveAs(blob, `${fileBaseName(caseRecord.title)}_사업계획서_v${model.version}.docx`);
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
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

function appendPdfBlock(parent: HTMLElement, build: (block: HTMLElement) => void): void {
  const block = document.createElement("section");
  block.className = "pdf-block";
  build(block);
  parent.append(block);
}

function buildPdfElement(caseRecord: CaseRecord): HTMLElement {
  const model = buildCaseDocumentModel(caseRecord);
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
    fontSize: "14px",
    lineHeight: "1.65",
    zIndex: "-1",
    boxSizing: "border-box",
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h1", model.title);
    appendText(block, "p", `문서 버전 ${model.version} · 작성자 ${model.author} · 생성 ${formatSeoulDate(model.createdAt)}`, "pdf-meta");
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "대상 필지");
    appendTable(block, ["주소", "PNU", "면적", "용도지역"], model.parcels.map((parcel) => [parcel.address, parcel.pnu, parcel.area, parcel.zoning]));
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "허가 및 관련 절차");
    appendTable(block, ["절차", "관계", "신청", "검토"], model.permits.map((permit) => [permit.name, permit.relation, permit.application, permit.review]));
  });
  model.sections.forEach((section) => {
    appendPdfBlock(page, (block) => {
      appendText(block, "h2", section.title);
      section.paragraphs.forEach((paragraph) => appendText(block, "p", paragraph));
    });
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "첨부 목록");
    if (model.attachments.length) appendTable(block, ["파일명", "역할", "버전"], model.attachments.map((item) => [item.name, item.role, item.version]));
    else appendText(block, "p", "등록된 첨부가 없습니다.");
  });
  appendPdfBlock(page, (block) => {
    appendText(block, "h2", "출처 및 작성 정보");
    model.sources.forEach((source) => appendText(block, "p", `• ${source}`));
    appendText(block, "p", model.notice, "pdf-notice");
  });

  const style = document.createElement("style");
  style.textContent = `
    .pdf-export-page h1 { margin: 0 0 8px; font-size: 30px; color: #000; }
    .pdf-export-page .pdf-block { display: flow-root; break-inside: avoid; }
    .pdf-export-page h2 { margin: 28px 0 12px; font-size: 19px; color: #000; }
    .pdf-export-page p { margin: 6px 0; }
    .pdf-export-page .pdf-meta { color: #667085; margin-bottom: 28px; }
    .pdf-export-page table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; }
    .pdf-export-page th { background: #004541; color: white; text-align: left; padding: 10px; font-weight: 700; }
    .pdf-export-page td { border: 1px solid #d9d9d9; padding: 10px; vertical-align: middle; }
    .pdf-export-page tr:nth-child(even) td { background: #f4f8f8; }
    .pdf-export-page .pdf-notice { margin-top: 24px; font-weight: 700; color: #344054; }
  `;
  page.append(style);
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
      block.style.marginTop = `${pageHeight - offsetOnPage + pageMargin}px`;
    }
  });
  const pageCount = Math.max(1, Math.ceil(element.scrollHeight / pageHeight));
  element.style.height = `${Math.ceil(pageCount * pageHeight)}px`;
  return pageCount;
}

export async function exportCasePdf(caseRecord: CaseRecord): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const element = buildPdfElement(caseRecord);
  try {
    await document.fonts.ready;
    const pageCount = paginatePdfElement(element);
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff", logging: false });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const image = canvas.toDataURL("image/jpeg", 0.94);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(image, "JPEG", 0, -pageIndex * pageHeight, imageWidth, imageHeight, undefined, "FAST");
    }
    const model = buildCaseDocumentModel(caseRecord);
    pdf.save(`${fileBaseName(caseRecord.title)}_사업계획서_v${model.version}.pdf`);
  } finally {
    element.remove();
  }
}
