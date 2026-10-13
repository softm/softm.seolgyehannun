import { describe, expect, it } from "vitest";
import { buildInvitationUrl } from "../domain/invitationUrl";

describe("조직 초대 URL", () => {
  it("GitHub Pages에서는 HashRouter 경로로 만든다", () => {
    expect(buildInvitationUrl("https://seolgyehannun.designboard.net", "org/id", "token value", true))
      .toBe("https://seolgyehannun.designboard.net/#/invite?organizationId=org%2Fid&token=token%20value");
  });

  it("일반 Hosting에서는 브라우저 경로로 만든다", () => {
    expect(buildInvitationUrl("https://example.web.app/", "org", "token", false))
      .toBe("https://example.web.app/invite?organizationId=org&token=token");
  });
});
