import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import type { AttachmentRecord, AppUser } from "../types";
import { isPreviewableFile, validateAttachment } from "../domain/files";
import { getFirebaseServices } from "./firebase";

export interface UploadProgress {
  transferred: number;
  total: number;
  percent: number;
}

export async function uploadCaseAttachment(
  organizationId: string,
  caseId: string,
  file: File,
  role: string,
  user: AppUser,
  onProgress?: (progress: UploadProgress) => void,
): Promise<AttachmentRecord> {
  const validationError = validateAttachment(file);
  if (validationError) throw new Error(validationError);
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
  const storagePath = `organizations/${organizationId}/cases/${caseId}/attachments/${id}/${safeName}`;
  const services = getFirebaseServices();

  if (!services || user.isDemo) {
    onProgress?.({ transferred: file.size, total: file.size, percent: 100 });
    return {
      id,
      name: file.name,
      storagePath,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      role,
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
      previewable: isPreviewableFile(file.name),
    };
  }

  const uploadTask = uploadBytesResumable(ref(services.storage, storagePath), file, {
    contentType: file.type || "application/octet-stream",
    customMetadata: { organizationId, caseId, attachmentId: id, role },
  });
  await new Promise<void>((resolve, reject) => {
    uploadTask.on("state_changed", (snapshot) => {
      onProgress?.({
        transferred: snapshot.bytesTransferred,
        total: snapshot.totalBytes,
        percent: Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      });
    }, reject, resolve);
  });

  return {
    id,
    name: file.name,
    storagePath,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    role,
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: user.uid,
    previewable: isPreviewableFile(file.name),
  };
}

export async function attachmentDownloadUrl(storagePath: string): Promise<string | null> {
  const services = getFirebaseServices();
  if (!services) return null;
  return getDownloadURL(ref(services.storage, storagePath));
}
