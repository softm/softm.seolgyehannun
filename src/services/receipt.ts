import { getToken } from "firebase/app-check";
import type { ReceiptRecord } from "../types";
import { firebaseConfigured, getFirebaseServices } from "./firebase";

export interface ReceiptLookupResult {
  mode: "sample" | "connected";
  supported: boolean;
  status: "found" | "unsupported" | "failed";
  agency?: string;
  receivedAt?: string;
  message: string;
}

export interface ReceiptLookupProvider {
  lookup(receiptNumber: string, jurisdictionCode: string): Promise<ReceiptLookupResult>;
}

const apiBase = import.meta.env.VITE_API_BASE || "/api";

async function apiHeaders(): Promise<HeadersInit> {
  const services = getFirebaseServices();
  if (!services?.auth.currentUser) throw new Error("로그인이 필요합니다.");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await services.auth.currentUser.getIdToken()}`,
  };
  if (services.appCheck) {
    headers["X-Firebase-AppCheck"] = (await getToken(services.appCheck, false)).token;
  }
  return headers;
}

export class SampleReceiptLookupProvider implements ReceiptLookupProvider {
  async lookup(receiptNumber: string, jurisdictionCode: string): Promise<ReceiptLookupResult> {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    if (!receiptNumber.trim()) {
      return { mode: "sample", supported: false, status: "failed", message: "접수번호를 입력해 주세요." };
    }
    if (jurisdictionCode !== "41590") {
      return {
        mode: "sample",
        supported: false,
        status: "unsupported",
        message: "연결된 기관 조회가 없습니다. 접수증을 확인해 직접 입력해 주세요.",
      };
    }
    return {
      mode: "sample",
      supported: true,
      status: "found",
      agency: "화성시 (샘플)",
      receivedAt: new Date().toISOString(),
      message: "샘플 응답입니다. 실제 기관 처리 상태가 아닙니다.",
    };
  }
}

export class FirebaseReceiptLookupProvider implements ReceiptLookupProvider {
  async lookup(receiptNumber: string, jurisdictionCode: string): Promise<ReceiptLookupResult> {
    const url = new URL(`${apiBase}/receipts/sample`, window.location.origin);
    url.searchParams.set("receiptNumber", receiptNumber.trim());
    url.searchParams.set("jurisdictionCode", jurisdictionCode);
    const response = await fetch(url, { headers: await apiHeaders() });
    if (!response.ok) throw new Error(`접수 조회 연결 오류 (${response.status})`);
    const result = await response.json() as Omit<ReceiptLookupResult, "supported">;
    return {
      ...result,
      supported: result.status === "found",
    };
  }
}

export function createReceiptLookupProvider(): ReceiptLookupProvider {
  return firebaseConfigured ? new FirebaseReceiptLookupProvider() : new SampleReceiptLookupProvider();
}

export function manualReceipt(receiptNumber: string, agency: string, permitIds: string[]): ReceiptRecord {
  return {
    id: crypto.randomUUID(),
    agency,
    system: "직접 입력",
    receiptNumber,
    receivedAt: new Date().toISOString(),
    relatedPermitIds: permitIds,
    lookupMode: "manual",
    lookupStatus: "manual",
    sourceLabel: "사용자 직접 입력",
  };
}
