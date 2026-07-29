import { describe, expect, test } from "vitest"
import { generateCatalogAuthUrl } from "../src/apis/auth"

describe("generateCatalogAuthUrl", () => {
  const authUrl = () =>
    new URL(
      generateCatalogAuthUrl({
        clientId: "client-id",
        redirectUrl: "https://example.com/callback",
        stateParams: { workspaceId: "workspace-id" },
      }),
    )

  test("asks Facebook to rerequest previously declined permissions", () => {
    expect(authUrl().searchParams.get("auth_type")).toBe("rerequest")
  })

  /**
   * The rerequest above only matters for the permission a sync cannot work
   * without, so the two are asserted together: dropping `catalog_management`
   * from the scope would leave the flag with nothing to re-ask for.
   */
  test("requests the catalog permission every sync depends on", () => {
    expect(authUrl().searchParams.get("scope")).toContain("catalog_management")
  })
})
