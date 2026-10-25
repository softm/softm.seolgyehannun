export type AdFitPlacement = {
  unit: string;
  width: 320 | 728;
  height: 90 | 100;
};

export const adFitConfig = {
  enabled: true,
  script: "https://t1.kakaocdn.net/kas/static/ba.min.js",
  placements: {
    mobile: { unit: "DAN-F1SvIBI8e9z004AS", width: 320, height: 100 },
    desktop: { unit: "DAN-XGZYKOeTebfHnIAb", width: 728, height: 90 },
  },
} as const;

export function selectAdFitPlacement(availableWidth: number): AdFitPlacement | null {
  if (availableWidth >= adFitConfig.placements.desktop.width) {
    return adFitConfig.placements.desktop;
  }
  if (availableWidth >= adFitConfig.placements.mobile.width) {
    return adFitConfig.placements.mobile;
  }
  return null;
}
