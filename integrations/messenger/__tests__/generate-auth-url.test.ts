import { describe, expect, test } from "vitest"
import { generateAuthUrl } from "../src/apis/auth"

describe("generateAuthUrl", () => {
  test("asks Facebook to rerequest previously declined permissions", () => {
    const authUrl = generateAuthUrl({
      clientId: "client-id",
      redirectUrl: "https://example.com/callback",
      stateParams: { workspaceId: "workspace-id" },
    })

    expect(new URL(authUrl).searchParams.get("auth_type")).toBe("rerequest")
  })
})
