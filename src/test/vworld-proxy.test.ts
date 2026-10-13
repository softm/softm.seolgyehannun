import { describe, expect, it } from "vitest";
import { copyAllowedVWorldQuery } from "../../functions/src/vworldProxy";

describe("VWorld proxy query allowlist", () => {
  it("forwards mixed-case spatial and paging keys", () => {
    const source = new URLSearchParams({
      service: "data",
      request: "GetFeature",
      geomFilter: "POINT(126.1 37.2)",
      pageNo: "1",
      numOfRows: "10",
    });
    const target = new URLSearchParams();

    copyAllowedVWorldQuery(source, target);

    expect(target.get("geomFilter")).toBe("POINT(126.1 37.2)");
    expect(target.get("pageNo")).toBe("1");
    expect(target.get("numOfRows")).toBe("10");
  });

  it("does not forward API keys or arbitrary parameters", () => {
    const source = new URLSearchParams({
      key: "client-secret",
      apiKey: "client-secret",
      unexpected: "value",
      pnu: "4119410600107420001",
    });
    const target = new URLSearchParams();

    copyAllowedVWorldQuery(source, target);

    expect(target.get("pnu")).toBe("4119410600107420001");
    expect(target.has("key")).toBe(false);
    expect(target.has("apiKey")).toBe(false);
    expect(target.has("unexpected")).toBe(false);
  });
});
