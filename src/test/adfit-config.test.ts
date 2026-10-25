import { describe, expect, it } from "vitest";
import { adFitConfig, selectAdFitPlacement } from "../adfitConfig";

describe("AdFit responsive placement", () => {
  it("uses the desktop unit when 728px is available", () => {
    expect(selectAdFitPlacement(728)).toEqual(adFitConfig.placements.desktop);
  });

  it("uses the mobile unit between 320px and 727px", () => {
    expect(selectAdFitPlacement(360)).toEqual(adFitConfig.placements.mobile);
  });

  it("returns no placement instead of clipping below 320px", () => {
    expect(selectAdFitPlacement(319)).toBeNull();
  });
});
