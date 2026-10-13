import { getToken } from "firebase/app-check";
import { sampleParcels } from "../data/demo";
import type { ParcelSnapshot } from "../types";
import { getFirebaseServices } from "./firebase";

export interface VWorldSearchResult {
  id: string;
  title: string;
  address: string;
  roadAddress: string;
  pnu: string;
  longitude: number;
  latitude: number;
  category: "road" | "parcel" | "place";
}

export interface VWorldReverseAddress {
  address: string;
  roadAddress: string;
}

const apiBase = import.meta.env.VITE_API_BASE || "/api";

export async function vworldAuthorizedHeaders(): Promise<HeadersInit> {
  const services = getFirebaseServices();
  if (!services) return {};
  const headers: Record<string, string> = {};
  if (services.auth.currentUser) headers.Authorization = `Bearer ${await services.auth.currentUser.getIdToken()}`;
  if (services.appCheck) {
    const token = await getToken(services.appCheck, false);
    headers["X-Firebase-AppCheck"] = token.token;
  }
  return headers;
}

export function vworldApiUrl(path: string): string {
  return new URL(`${apiBase}${path}`, window.location.origin).toString();
}

async function getJson(path: string, params: Record<string, string | number | boolean>): Promise<unknown> {
  const url = new URL(vworldApiUrl(path));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { headers: await vworldAuthorizedHeaders() });
  if (!response.ok) throw new Error(`VWorld 연결 오류 (${response.status})`);
  return response.json();
}

function plainText(value: unknown): string {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");
  return template.content.textContent?.trim() ?? "";
}

function normalizeSearchItem(item: Record<string, any>, category: VWorldSearchResult["category"], index: number): VWorldSearchResult {
  const longitude = Number(item?.point?.x);
  const latitude = Number(item?.point?.y);
  const roadAddress = plainText(item?.address?.road);
  const parcelAddress = plainText(item?.address?.parcel);
  const title = plainText(item?.title) || parcelAddress || roadAddress;
  return {
    id: `search-${category}-${longitude}-${latitude}-${index}`,
    title,
    address: parcelAddress || roadAddress || title,
    roadAddress,
    pnu: /^\d{19}$/.test(String(item?.id ?? "")) ? String(item.id) : "",
    longitude,
    latitude,
    category,
  };
}

export async function searchVWorld(queryText: string): Promise<VWorldSearchResult[]> {
  const query = queryText.trim();
  if (query.length < 2) return [];
  if (!getFirebaseServices()) {
    return sampleParcels
      .filter((parcel) => parcel.address.includes(query) || parcel.lotNumber?.includes(query))
      .map((parcel) => ({
        id: parcel.id,
        title: parcel.address,
        address: parcel.address,
        roadAddress: parcel.roadAddress ?? "",
        pnu: parcel.pnu,
        longitude: parcel.longitude,
        latitude: parcel.latitude,
        category: "parcel" as const,
      }));
  }

  const targets = [
    { type: "address", category: "road" as const },
    { type: "address", category: "parcel" as const },
    { type: "place", category: "place" as const },
  ];
  const settled = await Promise.allSettled(targets.map(async (target) => {
    const payload = await getJson("/vworld/search", {
      service: "search",
      request: "search",
      version: "2.0",
      crs: "EPSG:4326",
      size: 10,
      page: 1,
      query,
      type: target.type,
      category: target.type === "place" ? "" : target.category,
      format: "json",
      errorformat: "json",
    }) as any;
    const response = payload?.response;
    if (response?.status && !["OK", "NOT_FOUND"].includes(response.status)) {
      throw new Error(response?.error?.text || response.status);
    }
    return (response?.result?.items ?? []).map((item: Record<string, any>, index: number) => (
      normalizeSearchItem(item, target.category, index)
    ));
  }));

  const fulfilled = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!fulfilled.length && settled.every((result) => result.status === "rejected")) {
    throw new Error("주소 검색 서비스에 연결하지 못했습니다.");
  }
  const seen = new Set<string>();
  return fulfilled.filter((item) => {
    const key = item.pnu || `${item.longitude},${item.latitude},${item.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Number.isFinite(item.longitude) && Number.isFinite(item.latitude);
  }).slice(0, 12);
}

export async function reverseGeocodeVWorld(longitude: number, latitude: number): Promise<VWorldReverseAddress> {
  if (!getFirebaseServices()) {
    const nearest = sampleParcels[0];
    return { address: nearest.address, roadAddress: nearest.roadAddress ?? "" };
  }
  const payload = await getJson("/vworld/address", {
    service: "address",
    request: "getaddress",
    version: "2.0",
    crs: "EPSG:4326",
    point: `${longitude},${latitude}`,
    format: "json",
    type: "both",
    zipcode: true,
    simple: false,
  }) as any;
  const response = payload?.response;
  if (response?.status && !["OK", "NOT_FOUND"].includes(response.status)) {
    throw new Error(response?.error?.text || response.status);
  }
  const addresses = Array.isArray(response?.result)
    ? response.result
    : [response?.result].filter(Boolean);
  const parcelAddress = addresses.find((item: any) => String(item?.type).toLowerCase().includes("parcel"));
  const roadAddress = addresses.find((item: any) => String(item?.type).toLowerCase().includes("road"));
  const address = plainText(parcelAddress?.text) || plainText(roadAddress?.text);
  if (!address) throw new Error("현재 위치의 주소를 확인하지 못했습니다.");
  return { address, roadAddress: plainText(roadAddress?.text) };
}

export async function lookupParcel(longitude: number, latitude: number, hint?: VWorldSearchResult): Promise<ParcelSnapshot> {
  if (!getFirebaseServices()) {
    const nearest = sampleParcels.find((parcel) => parcel.pnu === hint?.pnu) ?? sampleParcels[0];
    return { ...nearest, id: nearest.pnu, fetchedAt: new Date().toISOString() };
  }

  const datasets = ["LP_PA_CBND_BUBUN", "LP_PA_CBND_BONBUN"];
  const settled = await Promise.allSettled(datasets.map(async (dataset) => {
    const payload = await getJson("/vworld/data", {
      service: "data",
      request: "GetFeature",
      data: dataset,
      size: 10,
      page: 1,
      format: "json",
      geometry: true,
      attribute: true,
      crs: "EPSG:4326",
      geomFilter: `POINT(${longitude} ${latitude})`,
    }) as any;
    return payload?.response?.result?.featureCollection?.features?.[0] ?? null;
  }));
  const fulfilledFeature = settled.find(
    (result): result is PromiseFulfilledResult<any> => result.status === "fulfilled" && Boolean(result.value),
  );
  const feature = fulfilledFeature?.value as any;
  const properties = feature?.properties ?? {};
  const normalizedProperties = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const pnu = String(normalizedProperties.pnu ?? hint?.pnu ?? "");
  if (!/^\d{19}$/.test(pnu)) throw new Error("이 위치에서 유효한 필지 PNU를 확인하지 못했습니다.");

  const reverseAddress = hint?.address
    ? { address: hint.address, roadAddress: hint.roadAddress }
    : await reverseGeocodeVWorld(longitude, latitude);

  return {
    id: pnu,
    pnu,
    address: reverseAddress.address || "선택 필지",
    roadAddress: reverseAddress.roadAddress,
    lotNumber: String(normalizedProperties.jibun ?? ""),
    category: String(normalizedProperties.jimok ?? normalizedProperties.jimok_nm ?? ""),
    ledgerAreaM2: Number(normalizedProperties.parea ?? normalizedProperties.area ?? 0) || undefined,
    zoning: [],
    longitude,
    latitude,
    jurisdictionCode: pnu.slice(0, 5),
    jurisdictionName: reverseAddress.address.split(" ").slice(0, 2).join(" "),
    source: "VWorld 공간정보 오픈플랫폼",
    sourceUrl: "https://www.vworld.kr/",
    fetchedAt: new Date().toISOString(),
    verifiedByUser: false,
  };
}
