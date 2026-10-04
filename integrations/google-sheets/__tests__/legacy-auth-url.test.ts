import { describe, expect, test } from "vitest"
import { generateAuthUrl } from "../src/client"
import { GOOGLE_SHEETS_SCOPES } from "../src/constants"

describe("Google Sheets legacy authorization URL", () => {
  test("requests the identity scopes used to derive the connection source id", () => {
    const url = new URL(
      generateAuthUrl({
        clientId: "client-1",
        clientSecret: "secret-1",
        redirectUrl: "https://app.example.test/callback",
        stateParams: { workspaceId: "workspace-1" },
      }),
    )

    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      GOOGLE_SHEETS_SCOPES,
    )
  })
})
