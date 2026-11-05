import { HTTPError } from "ky"
import { afterEach, describe, expect, it, vi } from "vitest"

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock },
    HTTPError: actual.HTTPError,
  }
})

import { triggerSmbAppDataSync } from "../src/api/coexists"
import { WhatsappException } from "../src/exception"
import type { WhatsappAuthValue } from "../src/schema"

const buildAuth = (): WhatsappAuthValue =>
  ({
    clientId: "client",
    clientSecret: "secret",
    verifyToken: "verify",
    redirectUrl: "https://example.com/cb",
    authType: "oauth2",
    tokens: { accessToken: "tok-xyz" },
    version: "v23.0",
    metadata: { wabaId: "waba-1" },
  }) as unknown as WhatsappAuthValue

const textResponse = (body: string) => ({
  text: vi.fn().mockResolvedValue(body),
})

const okResponse = () => textResponse(JSON.stringify({ success: true }))

const errorResponse = (err: unknown) => ({
  text: vi.fn().mockRejectedValue(err),
})

const makeHttpError = (status: number, body: unknown) => {
  const response = new Response(JSON.stringify(body), { status })
  const request = new Request("https://graph.facebook.com/v23.0/x")
  const err = new HTTPError(response, request, {} as never)
  ;(err as unknown as { data: unknown }).data = body
  return err
}

afterEach(() => {
  postMock.mockReset()
})

describe("triggerSmbAppDataSync", () => {
  it("posts to /{phoneNumberId}/smb_app_data with smb_app_state_sync body", async () => {
    postMock.mockReturnValueOnce(okResponse())

    const result = await triggerSmbAppDataSync({
      auth: buildAuth(),
      phoneNumberId: "phone-42",
      syncType: "smb_app_state_sync",
    })

    expect(result).toEqual({ ok: true })
    const [url, options] = postMock.mock.calls[0]
    expect(url).toContain("/phone-42/smb_app_data")
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      sync_type: "smb_app_state_sync",
    })
    expect(options.headers.Authorization).toBe("Bearer tok-xyz")
  })

  it("posts history sync_type body", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await triggerSmbAppDataSync({
      auth: buildAuth(),
      phoneNumberId: "phone-7",
      syncType: "history",
    })

    const [, options] = postMock.mock.calls[0]
    expect(options.json.sync_type).toBe("history")
  })

  it("returns ok:false reason:already_triggered when Meta reports duplicate trigger", async () => {
    postMock.mockReturnValueOnce(
      errorResponse(
        makeHttpError(400, {
          error: { message: "smb_app_data sync already triggered" },
        }),
      ),
    )

    const result = await triggerSmbAppDataSync({
      auth: buildAuth(),
      phoneNumberId: "phone-1",
      syncType: "history",
    })

    expect(result).toEqual({ ok: false, reason: "already_triggered" })
  })

  it("returns ok:false reason:window_expired when Meta reports 24h window lapsed", async () => {
    postMock.mockReturnValueOnce(
      errorResponse(
        makeHttpError(400, {
          error: { message: "24 hour onboarding window has expired" },
        }),
      ),
    )

    const result = await triggerSmbAppDataSync({
      auth: buildAuth(),
      phoneNumberId: "phone-1",
      syncType: "smb_app_state_sync",
    })

    expect(result).toEqual({ ok: false, reason: "window_expired" })
  })

  it("accepts the documented { messaging_product, request_id } response", async () => {
    postMock.mockReturnValueOnce(
      textResponse(
        JSON.stringify({ messaging_product: "whatsapp", request_id: "req-1" }),
      ),
    )

    const result = await triggerSmbAppDataSync({
      auth: buildAuth(),
      phoneNumberId: "phone-1",
      syncType: "history",
    })

    expect(result).toEqual({ ok: true })
  })

  it("accepts an empty 2xx body", async () => {
    postMock.mockReturnValueOnce(textResponse(""))

    const result = await triggerSmbAppDataSync({
      auth: buildAuth(),
      phoneNumberId: "phone-1",
      syncType: "history",
    })

    expect(result).toEqual({ ok: true })
  })

  it("throws when Meta returns { success: false }", async () => {
    postMock.mockReturnValueOnce(
      textResponse(JSON.stringify({ success: false })),
    )

    await expect(
      triggerSmbAppDataSync({
        auth: buildAuth(),
        phoneNumberId: "phone-1",
        syncType: "history",
      }),
    ).rejects.toBeInstanceOf(WhatsappException)
  })

  it("throws on a non-JSON 2xx body", async () => {
    postMock.mockReturnValueOnce(textResponse("<html>oops</html>"))

    await expect(
      triggerSmbAppDataSync({
        auth: buildAuth(),
        phoneNumberId: "phone-1",
        syncType: "history",
      }),
    ).rejects.toBeInstanceOf(WhatsappException)
  })

  it("throws on an unknown JSON shape", async () => {
    postMock.mockReturnValueOnce(textResponse(JSON.stringify({ ok: 1 })))

    await expect(
      triggerSmbAppDataSync({
        auth: buildAuth(),
        phoneNumberId: "phone-1",
        syncType: "history",
      }),
    ).rejects.toBeInstanceOf(WhatsappException)
  })

  it("returns not_eligible for Meta code 131000 / subcode 10", async () => {
    postMock.mockReturnValueOnce(
      errorResponse(
        makeHttpError(400, { error: { code: 131_000, error_subcode: 10 } }),
      ),
    )

    const result = await triggerSmbAppDataSync({
      auth: buildAuth(),
      phoneNumberId: "phone-1",
      syncType: "history",
    })

    expect(result).toEqual({ ok: false, reason: "not_eligible" })
  })

  it("rethrows other HTTP errors", async () => {
    postMock.mockReturnValueOnce(
      errorResponse(makeHttpError(500, { error: { message: "boom" } })),
    )

    await expect(
      triggerSmbAppDataSync({
        auth: buildAuth(),
        phoneNumberId: "phone-1",
        syncType: "history",
      }),
    ).rejects.toThrow()
  })
})
