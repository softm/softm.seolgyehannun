import type { PermitSelection } from "../types";

export interface PermitCatalogItem {
  id: string;
  name: string;
  description: string;
  category: "main" | "agenda";
  legalBasis: string;
  icon: string;
  accent: string;
  canBePrimary: boolean;
}

export const defaultPermitCatalog: PermitCatalogItem[] = [
  { id: "factory", name: "공장설립", description: "공장 신설·증설·업종 변경", category: "main", legalBasis: "산업집적활성화 및 공장설립에 관한 법률", icon: "Factory", accent: "blue", canBePrimary: true },
  { id: "development", name: "개발행위", description: "토지 형질변경·건축물 설치", category: "main", legalBasis: "국토의 계획 및 이용에 관한 법률", icon: "Sprout", accent: "green", canBePrimary: true },
  { id: "road", name: "도로점용", description: "도로 구역 점용·굴착", category: "main", legalBasis: "도로법", icon: "Route", accent: "orange", canBePrimary: true },
  { id: "national-property", name: "국유재산", description: "국유재산 사용허가", category: "main", legalBasis: "국유재산법", icon: "Landmark", accent: "purple", canBePrimary: true },
  { id: "public-property", name: "공유재산", description: "공유재산 사용허가", category: "main", legalBasis: "공유재산 및 물품 관리법", icon: "Building2", accent: "coral", canBePrimary: true },
  { id: "public-water", name: "공유수면", description: "공유수면 점용·사용", category: "main", legalBasis: "공유수면 관리 및 매립에 관한 법률", icon: "Waves", accent: "sky", canBePrimary: true },
  { id: "agri-facility", name: "농업생산기반시설", description: "농업기반시설 목적 외 사용", category: "main", legalBasis: "농어촌정비법", icon: "Wheat", accent: "gold", canBePrimary: true },
  { id: "forest-conversion", name: "산지전용", description: "산지전용 허가·신고 검토", category: "agenda", legalBasis: "산지관리법", icon: "Trees", accent: "green", canBePrimary: false },
  { id: "farmland-conversion", name: "농지전용", description: "농지전용 허가·협의 검토", category: "agenda", legalBasis: "농지법", icon: "Tractor", accent: "gold", canBePrimary: false },
];

export function validatePermitComposition(permits: PermitSelection[]): string[] {
  const errors: string[] = [];
  const primaries = permits.filter((permit) => permit.relation === "primary");
  if (primaries.length !== 1) errors.push("문서 작성 묶음에는 주허가가 1개 필요합니다.");
  if (new Set(permits.map((permit) => permit.catalogId)).size !== permits.length) {
    errors.push("같은 절차를 중복으로 추가할 수 없습니다.");
  }
  permits.forEach((permit) => {
    if (permit.applicationKind === "change" && !permit.existingPermitNumber?.trim()) {
      errors.push(`${permit.name} 변경 신청에는 기존 허가번호가 필요합니다.`);
    }
    if (permit.relation === "agenda" && permit.reviewState === "confirmed" && !permit.legalBasis) {
      errors.push(`${permit.name} 의제 확정 근거를 기록해 주세요.`);
    }
  });
  return errors;
}

export function nextPermitSelection(item: PermitCatalogItem, relation: PermitSelection["relation"]): PermitSelection {
  return {
    id: crypto.randomUUID(),
    catalogId: item.id,
    name: item.name,
    relation,
    applicationKind: "new",
    legalBasis: item.legalBasis,
    reviewState: relation === "agenda" ? "review-needed" : "unreviewed",
    consultationStatus: relation === "agenda" ? "not-requested" : undefined,
  };
}
