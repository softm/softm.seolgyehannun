const ALLOWED_EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "dwg", "dxf", "docx", "hwpx", "xlsx",
]);

const PREVIEWABLE_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"]);
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateAttachment(file: Pick<File, "name" | "size">): string | null {
  const extension = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) return "허용되지 않는 파일 형식입니다.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "파일은 50MB 이하여야 합니다.";
  return null;
}

export function isPreviewableFile(name: string): boolean {
  return PREVIEWABLE_EXTENSIONS.has(fileExtension(name));
}
