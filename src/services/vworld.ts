import { sampleParcels } from "../data/demo";
import type { ParcelBoundary, ParcelSnapshot } from "../types";
import { apiUrl, authorizedApiHeaders } from "./api";
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

export { apiUrl as vworldApiUrl, authorizedApiHeaders as vworldAuthorizedHeaders };

async function getJson(path: string, params: Record<string, string | number | boolean>): Promise<unknown> {
  const url = new URL(apiUrl(path));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { headers: await authorizedApiHeaders() });
  if (!response.ok) throw new Error(`VWorld 연결 오류 (${response.status})`);
  return response.json();
}

function plainText(value: unknown): string {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");
  return template.content.textContent?.trim() ?? "";
}

function recordsAt(value: unknown, path: string[]): Record<string, unknown>[] {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return [];
    current = (current as Record<string, unknown>)[key];
  }
  const records = Array.isArray(current) ? current : current ? [current] : [];
  return records.filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === "object");
}

export function normalizeNedParcelDetails(
  ledgerPayload: unknown,
  landUsePayload: unknown,
): Pick<ParcelSnapshot, "ledgerAreaM2" | "sourceLedgerAreaM2" | "category" | "zoning"> {
  const ledger = recordsAt(ledgerPayload, ["fields", "ladfrlVOList"])[0]
    ?? recordsAt(ledgerPayload, ["response", "fields", "field"])[0]
    ?? {};
  const ledgerAreaM2 = Number(ledger.lndpclAr ?? 0) || undefined;
  const category = plainText(ledger.lndcgrCodeNm);
  const zoning = recordsAt(landUsePayload, ["response", "fields", "field"])
    .map((record) => plainText(record.prposAreaDstrcCodeNm))
    .filter((name, index, names) => Boolean(name) && names.indexOf(name) === index);
  return { ledgerAreaM2, sourceLedgerAreaM2: ledgerAreaM2, category, zoning };
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

function normalizePosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

function normalizeRing(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null;
  const ring = value.map(normalizePosition);
  return ring.length >= 4 && ring.every((position) => position !== null)
    ? ring as [number, number][]
    : null;
}

function normalizePolygon(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) return null;
  const polygon = value.map(normalizeRing);
  return polygon.length > 0 && polygon.every((ring) => ring !== null)
    ? polygon as [number, number][][]
    : null;
}

export function normalizeParcelBoundary(value: unknown): ParcelBoundary | undefined {
  let geometry = value;
  if (typeof geometry === "string") {
    try {
      geometry = JSON.parse(geometry);
    } catch {
      return undefined;
    }
  }
  if (!geometry || typeof geometry !== "object") return undefined;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (candidate.type === "Polygon") {
    const coordinates = normalizePolygon(candidate.coordinates);
    return coordinates ? { type: "Polygon", coordinates } : undefined;
  }
  if (candidate.type === "MultiPolygon" && Array.isArray(candidate.coordinates)) {
    const polygons = candidate.coordinates.map(normalizePolygon);
    return polygons.length > 0 && polygons.every((polygon) => polygon !== null)
      ? { type: "MultiPolygon", coordinates: polygons as [number, number][][][] }
      : undefined;
  }
  return undefined;
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
  const boundary = normalizeParcelBoundary(feature?.geometry);
  const normalizedProperties = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const pnu = String(normalizedProperties.pnu ?? hint?.pnu ?? "");
  if (!/^\d{19}$/.test(pnu)) throw new Error("이 위치에서 유효한 필지 PNU를 확인하지 못했습니다.");

  const [ledgerResult, landUseResult] = await Promise.allSettled([
    getJson("/vworld/ned/ladfrlList", { pnu, pageNo: 1, numOfRows: 10 }),
    getJson("/vworld/ned/getLandUseAttr", { pnu, pageNo: 1, numOfRows: 1000 }),
  ]);
  const details = normalizeNedParcelDetails(
    ledgerResult.status === "fulfilled" ? ledgerResult.value : undefined,
    landUseResult.status === "fulfilled" ? landUseResult.value : undefined,
  );

  const reverseAddress = hint?.address
    ? { address: hint.address, roadAddress: hint.roadAddress }
    : await reverseGeocodeVWorld(longitude, latitude);
  const ledgerAreaM2 = details.ledgerAreaM2
    ?? (Number(normalizedProperties.parea ?? normalizedProperties.area ?? 0) || undefined);

  return {
    id: pnu,
    pnu,
    address: reverseAddress.address || "선택 필지",
    roadAddress: reverseAddress.roadAddress,
    lotNumber: String(normalizedProperties.jibun ?? ""),
    category: details.category || String(normalizedProperties.jimok ?? normalizedProperties.jimok_nm ?? ""),
    ledgerAreaM2,
    surveyedAreaM2: ledgerAreaM2,
    plannedAreaM2: ledgerAreaM2,
    roadOccupancyAreaM2: 0,
    excludedAreaM2: 0,
    role: "project-site",
    ownerNames: [],
    sourceLedgerAreaM2: ledgerAreaM2,
    userModifiedFields: [],
    zoning: details.zoning,
    longitude,
    latitude,
    ...(boundary ? { boundary } : {}),
    jurisdictionCode: pnu.slice(0, 5),
    jurisdictionName: reverseAddress.address.split(" ").slice(0, 2).join(" "),
    source: "VWorld 공간정보 오픈플랫폼",
    sourceUrl: "https://www.vworld.kr/",
    fetchedAt: new Date().toISOString(),
    verifiedByUser: false,
  };
}
