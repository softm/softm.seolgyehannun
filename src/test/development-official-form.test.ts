import { describe, expect, it } from "vitest";
import { makeDemoCases } from "../data/demo";
import { buildCaseDocumentModels } from "../domain/documentModel";
import { buildReferencePdfPages } from "../services/documentPdfTemplates";

describe("개발행위 국가서식 PDF", () => {
  it("기입값을 넓고 선명하게 표시하며 긴 내용은 지정된 칸 안에 유지한다", () => {
    const record = makeDemoCases(new Date("2026-10-14T09:00:00+09:00"))[0];
    const [model] = buildCaseDocumentModels(record, ["development-application"]);
    const pages = buildReferencePdfPages(record, model)!;
    const front = pages[0].element;
    const checkbox = front.querySelector<HTMLElement>('[data-pdf-field="action-토지형질변경"]')!;
    const applicantName = front.querySelector<HTMLElement>('[data-pdf-field="applicantName"]')!;
    const siteAddress = front.querySelector<HTMLElement>('[data-pdf-field="siteAddress"]')!;
    const purpose = front.querySelector<HTMLElement>('[data-pdf-field="purpose"]')!;

    expect(pages).toHaveLength(2);
    expect(front.dataset.backgroundImage).toContain("development-application-page-1.png");
    expect(checkbox.style.left).toBe("26.3%");
    expect(checkbox.style.fontSize).toBe("15px");
    expect(Number.parseFloat(applicantName.style.fontSize)).toBeGreaterThanOrEqual(10.2);
    expect(front.style.fontFamily).toContain("SeolgyeNanumGothic");
    expect(front.style.fontSynthesis).toBe("none");
    expect(applicantName.style.fontWeight).toBe("500");
    expect(siteAddress.style.height).toBe("2.45%");
    expect(siteAddress.textContent).toContain("외 1필지");
    expect(Number.parseFloat(siteAddress.style.fontSize)).toBeGreaterThanOrEqual(9.8);
    expect(purpose.style.left).toBe("24.8%");
    expect(Number.parseFloat(purpose.style.fontSize)).toBeGreaterThanOrEqual(9.5);

    pages.forEach((page) => page.element.remove());
  });
});
