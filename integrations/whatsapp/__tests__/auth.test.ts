import { afterEach, describe, expect, it, vi } from "vitest"

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { get: getMock },
    HTTPError: actual.HTTPError,
  }
})

import { debugToken, getSharedWabaIds } from "../src/api/auth"

type KyGetOptions = {
  searchParams: {
    input_token: string
    access_token: string
  }
}

const okResponse = (body: unknown) => ({
  json: vi.fn().mockResolvedValue(body),
})

afterEach(() => {
  getMock.mockReset()
})

describe("debugToken", () => {
  it("debugs a user token with the supplied app access token", async () => {
    getMock.mockReturnValueOnce(
      okResponse({
        data: { app_id: "app-1", is_valid: true, user_id: "user-1" },
      }),
    )

    await debugToken("user-token", "app-id|app-secret")

    const [, options] = getMock.mock.calls[0] as [string, KyGetOptions]
    expect(options.searchParams).toMatchObject({
      input_token: "user-token",
      access_token: "app-id|app-secret",
    })
  })

  it("resolves the granted WABA ids from a token debugged by the app token", async () => {
    getMock.mockReturnValueOnce(
      okResponse({
        data: {
          app_id: "app-1",
          is_valid: true,
          user_id: "user-1",
          granular_scopes: [
            {
              scope: "whatsapp_business_management",
              target_ids: ["waba-1"],
            },
          ],
        },
      }),
    )

    const wabaIds = await getSharedWabaIds("user-token", "app-id|app-secret")

    const [, options] = getMock.mock.calls[0] as [string, KyGetOptions]
    expect(wabaIds).toEqual(["waba-1"])
    expect(options.searchParams).toMatchObject({
      input_token: "user-token",
      access_token: "app-id|app-secret",
    })
  })

  it("returns every WABA the token was granted, in Meta's order", async () => {
    // A system-user token carries every WABA the business has shared with the
    // app, not just the one picked in the dialog — and Meta does not promise
    // a stable order between tokens.
    getMock.mockReturnValueOnce(
      okResponse({
        data: {
          app_id: "app-1",
          is_valid: true,
          granular_scopes: [
            {
              scope: "whatsapp_business_management",
              target_ids: ["waba-9", "waba-1", "waba-5"],
            },
          ],
        },
      }),
    )

    await expect(
      getSharedWabaIds("user-token", "app-id|app-secret"),
    ).resolves.toEqual(["waba-9", "waba-1", "waba-5"])
  })

  it("returns an empty list when the token has no management scope", async () => {
    getMock.mockReturnValueOnce(
      okResponse({ data: { app_id: "app-1", is_valid: true } }),
    )

    await expect(
      getSharedWabaIds("user-token", "app-id|app-secret"),
    ).resolves.toEqual([])
  })
})
