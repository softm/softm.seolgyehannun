import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const runEmulatorTests = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);

describe.skipIf(!runEmulatorTests)("Firebase 조직 격리와 역할", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: process.env.GCLOUD_PROJECT ?? "demo-seolgye-hannun",
      firestore: { rules: readFileSync(resolve("firestore.rules"), "utf8") },
      storage: { rules: readFileSync(resolve("storage.rules"), "utf8") },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, "organizations/org-a"), { name: "A", ownerId: "admin-a" });
      await setDoc(doc(firestore, "organizations/org-a/members/admin-a"), { role: "admin", status: "active" });
      await setDoc(doc(firestore, "organizations/org-a/members/editor-a"), { role: "editor", status: "active" });
      await setDoc(doc(firestore, "organizations/org-a/members/viewer-a"), { role: "viewer", status: "active" });
      await setDoc(doc(firestore, "organizations/org-a/members/suspended-a"), { role: "editor", status: "suspended" });
      await setDoc(doc(firestore, "organizations/org-a/members/legacy-a"), { role: "viewer" });
      await setDoc(doc(firestore, "organizations/org-b"), { name: "B", ownerId: "admin-b" });
      await setDoc(doc(firestore, "organizations/org-b/members/admin-b"), { role: "admin", status: "active" });
      await setDoc(doc(firestore, "organizations/org-a/cases/case-1"), { organizationId: "org-a", title: "업무", version: 1 });
      await setDoc(doc(firestore, "organizations/org-a/cases/case-1/notifications/notice-1"), {
        recipientId: "viewer-a",
        title: "기한 알림",
        readAt: null,
      });
    });
  });

  afterAll(async () => environment?.cleanup());

  it("다른 조직 업무 읽기를 차단한다", async () => {
    const firestore = environment.authenticatedContext("admin-b").firestore();
    await assertFails(getDoc(doc(firestore, "organizations/org-a/cases/case-1")));
  });

  it("사용 정지된 구성원의 모든 조직 접근을 차단한다", async () => {
    const suspended = environment.authenticatedContext("suspended-a").firestore();
    await assertFails(getDoc(doc(suspended, "organizations/org-a/cases/case-1")));
    await assertFails(getDoc(doc(suspended, "organizations/org-a")));
  });

  it("상태 필드가 없던 기존 구성원은 마이그레이션 전에도 읽을 수 있다", async () => {
    const legacy = environment.authenticatedContext("legacy-a").firestore();
    await assertSucceeds(getDoc(doc(legacy, "organizations/org-a/cases/case-1")));
  });

  it("열람자의 업무 쓰기와 편집자의 구성원 관리를 차단한다", async () => {
    const viewer = environment.authenticatedContext("viewer-a").firestore();
    const editor = environment.authenticatedContext("editor-a").firestore();
    await assertFails(setDoc(doc(viewer, "organizations/org-a/cases/case-1"), { organizationId: "org-a", title: "변경", version: 2 }));
    await assertFails(setDoc(doc(editor, "organizations/org-a/members/new-user"), { role: "viewer" }));
  });

  it("편집자의 업무 수정과 관리자의 구성원 관리를 허용한다", async () => {
    const editor = environment.authenticatedContext("editor-a").firestore();
    const admin = environment.authenticatedContext("admin-a").firestore();
    await assertSucceeds(setDoc(doc(editor, "organizations/org-a/cases/case-1"), { organizationId: "org-a", title: "변경", version: 2 }));
    await assertSucceeds(setDoc(doc(admin, "organizations/org-a/members/new-user"), { role: "viewer" }));
  });

  it("관리자만 운영 설정을 쓰고 자기 자신의 멤버십은 직접 변경하지 못한다", async () => {
    const admin = environment.authenticatedContext("admin-a").firestore();
    const editor = environment.authenticatedContext("editor-a").firestore();
    await assertSucceeds(setDoc(doc(admin, "organizations/org-a/settings/workflow"), { reminderOffsets: [7, 3, 1, 0, -1] }));
    await assertSucceeds(setDoc(doc(admin, "organizations/org-a/catalogs/permits"), { items: [] }));
    await assertFails(setDoc(doc(editor, "organizations/org-a/settings/workflow"), { reminderOffsets: [1] }));
    await assertFails(updateDoc(doc(admin, "organizations/org-a/members/admin-a"), { role: "viewer" }));
  });

  it("알림 수신자의 읽음 표시만 허용한다", async () => {
    const viewer = environment.authenticatedContext("viewer-a").firestore();
    const editor = environment.authenticatedContext("editor-a").firestore();
    const path = "organizations/org-a/cases/case-1/notifications/notice-1";
    await assertSucceeds(updateDoc(doc(viewer, path), { readAt: "2026-10-13T09:00:00+09:00" }));
    await assertFails(updateDoc(doc(viewer, path), { title: "변조된 제목" }));
    await assertFails(updateDoc(doc(editor, path), { readAt: "2026-10-13T09:01:00+09:00" }));
  });

  it("Storage 파일 형식과 50MB 제한을 검사한다", async () => {
    const storage = environment.authenticatedContext("editor-a").storage();
    const base = "organizations/org-a/cases/case-1/attachments/a1";
    await assertSucceeds(uploadBytes(ref(storage, `${base}/plan.pdf`), new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(storage, `${base}/run.exe`), new Uint8Array([1, 2, 3]), { contentType: "application/octet-stream" }));
    await assertFails(uploadBytes(ref(storage, `${base}/huge.pdf`), new Uint8Array(50 * 1024 * 1024 + 1), { contentType: "application/pdf" }));
  }, 30_000);

  it("조직 구성원만 생성 문서를 읽을 수 있다", async () => {
    const path = "organizations/org-a/cases/case-1/documents/v002/사업계획서_v002.pdf";
    await environment.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), path), new Uint8Array([1, 2, 3]), { contentType: "application/pdf" });
    });

    const memberStorage = environment.authenticatedContext("viewer-a").storage();
    const outsiderStorage = environment.authenticatedContext("admin-b").storage();
    await assertSucceeds(getBytes(ref(memberStorage, path)));
    await assertFails(getBytes(ref(outsiderStorage, path)));
  });
});
