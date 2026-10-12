import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, isPreviewableFile, validateAttachment } from "../domain/files";
import { SampleReceiptLookupProvider } from "../services/receipt";

describe("첨부와 접수 조회 어댑터", () => {
  it("첨부 확장자와 50MB 제한을 검사한다", () => {
    expect(validateAttachment({ name: "plan.dwg", size: 1024 } as File)).toBeNull();
    expect(validateAttachment({ name: "run.exe", size: 1024 } as File)).toContain("허용되지 않는");
    expect(validateAttachment({ name: "plan.pdf", size: MAX_ATTACHMENT_BYTES + 1 } as File)).toContain("50MB");
    expect(isPreviewableFile("photo.jpg")).toBe(true);
    expect(isPreviewableFile("drawing.dxf")).toBe(false);
  });

  it("미지원 관할을 실패가 아닌 직접입력 전환으로 반환한다", async () => {
    const result = await new SampleReceiptLookupProvider().lookup("2026-001", "11110");
    expect(result.status).toBe("unsupported");
    expect(result.message).toContain("직접 입력");
  });
});
