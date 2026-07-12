import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import {
  buildHashedPayload,
  buildPageUidPayload,
  normalizePhoneNumber,
} from "../src/apis/audience-users"
import { generateAdsAuthUrl } from "../src/apis/auth"

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")

describe("normalizePhoneNumber", () => {
  test("uses the contact country to produce an E.164 number without plus", () => {
    expect(normalizePhoneNumber("0912 345 678", "VN")).toBe("84912345678")
    expect(normalizePhoneNumber("(212) 555-0175", "US")).toBe("12125550175")
  })

  test("keeps already-international numbers", () => {
    expect(normalizePhoneNumber("+84912345678")).toBe("84912345678")
  })

  test("uses the workspace fallback country when the contact has none", () => {
    expect(normalizePhoneNumber("0912345678", null, "VN")).toBe("84912345678")
    expect(normalizePhoneNumber("0912345678", "Vietnam", "VN")).toBe(
      "84912345678",
    )
  })

  test("returns null for a local-format number with no usable region", () => {
    expect(normalizePhoneNumber("09-99")).toBeNull()
    expect(normalizePhoneNumber("0912345678", "Vietnam")).toBeNull()
  })

  test("keeps digits that already carry a calling code", () => {
    expect(normalizePhoneNumber("84 912 345 678")).toBe("84912345678")
  })

  test("returns null when no digits remain", () => {
    expect(normalizePhoneNumber("n/a")).toBeNull()
  })
})

describe("buildPageUidPayload", () => {
  test("mirrors the legacy PAGEUID schema", () => {
    expect(buildPageUidPayload({ psid: "psid-1", pageId: "page-1" })).toEqual({
      schema: ["PAGEUID"],
      page_ids: ["page-1"],
      data: [["psid-1"]],
    })
  })
})

describe("buildHashedPayload", () => {
  test("hashes normalized phone, email, and names", async () => {
    const payload = await buildHashedPayload({
      email: " Person@Example.COM ",
      phoneNumber: "0912345678",
      firstName: " An ",
      lastName: "Nguyen",
      country: "VN",
    })

    expect(payload).toEqual({
      schema: ["PHONE", "EMAIL", "FN", "LN"],
      data: [
        [
          sha256("84912345678"),
          sha256("person@example.com"),
          sha256("an"),
          sha256("nguyen"),
        ],
      ],
    })
  })

  test("keeps nulls for missing optional fields", async () => {
    const payload = await buildHashedPayload({ email: "a@b.co" })
    expect(payload?.data).toEqual([[null, sha256("a@b.co"), null, null]])
  })

  test("returns null when neither phone nor email is present", async () => {
    expect(
      await buildHashedPayload({ firstName: "An", lastName: "Nguyen" }),
    ).toBeNull()
  })
})

describe("generateAdsAuthUrl", () => {
  test("requests the ads scopes and encodes state", () => {
    const url = new URL(
      generateAdsAuthUrl({
        clientId: "client-1",
        redirectUrl:
          "https://app.example.com/integrations/facebook-ads/callback",
        stateParams: { workspaceId: "ws-1" },
      }),
    )

    expect(url.origin).toBe("https://www.facebook.com")
    expect(url.searchParams.get("scope")).toBe("ads_read,ads_management")
    expect(url.searchParams.get("client_id")).toBe("client-1")
    expect(
      JSON.parse(
        Buffer.from(url.searchParams.get("state") ?? "", "base64").toString(),
      ),
    ).toEqual({ workspaceId: "ws-1" })
  })
})
