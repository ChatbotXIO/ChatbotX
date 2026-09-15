import { HTTPError } from "ky"
import { afterEach, describe, expect, it, vi } from "vitest"

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock },
    HTTPError: actual.HTTPError,
  }
})

import {
  acceptCall,
  connectCall,
  preAcceptCall,
  rejectCall,
  terminateCall,
  WhatsappCallGraphAction,
} from "../src/api/calling"
import { WhatsappException } from "../src/exception"
import type { WhatsappAuthValue } from "../src/schema"

const SDP_SENTINEL = "v=0 SDP-SENTINEL-MUST-NEVER-BE-LOGGED"

const buildAuth = (): WhatsappAuthValue =>
  ({
    clientId: "client",
    clientSecret: "secret",
    verifyToken: "verify",
    redirectUrl: "https://example.com/cb",
    authType: "oauth2",
    tokens: { accessToken: "tok-xyz" },
    version: "v23.0",
    metadata: { phoneNumber: { id: "phone-42" } },
  }) as unknown as WhatsappAuthValue

const okResponse = (
  body: unknown = { messaging_product: "whatsapp", calls: [{ id: "call-1" }] },
) => ({
  json: vi.fn().mockResolvedValue(body),
})

const makeHttpError = (status: number, body: unknown) => {
  const response = new Response(JSON.stringify(body), { status })
  const request = new Request(
    "https://graph.facebook.com/v23.0/phone-42/calls",
    {
      method: "POST",
      body: JSON.stringify({ session: { sdp: SDP_SENTINEL } }),
    },
  )
  const err = new HTTPError(response, request, {} as never)
  ;(err as unknown as { data: unknown }).data = body
  // Mirrors ky's real shape: the merged request options (including our SDP
  // json body) hang off the error. This is exactly what must never reach a
  // logger or thrown payload.
  ;(err as unknown as { options: unknown }).options = {
    json: {
      call_id: "call-1",
      session: { sdp_type: "answer", sdp: SDP_SENTINEL },
    },
  }
  return err
}

const errorResponse = (err: unknown) => ({
  json: vi.fn().mockRejectedValue(err),
})

afterEach(() => {
  postMock.mockReset()
  mockLogger.error.mockReset()
})

describe("preAcceptCall", () => {
  it("posts action:pre_accept with the answer session", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await preAcceptCall({
      auth: buildAuth(),
      callId: "call-1",
      sdpAnswer: "v=0 answer-sdp",
    })

    const [url, options] = postMock.mock.calls[0]
    expect(url).toContain("/phone-42/calls")
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      call_id: "call-1",
      action: WhatsappCallGraphAction.preAccept,
      session: { sdp_type: "answer", sdp: "v=0 answer-sdp" },
    })
    expect(options.headers.Authorization).toBe("Bearer tok-xyz")
  })
})

describe("acceptCall", () => {
  it("posts action:accept with the answer session", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await acceptCall({
      auth: buildAuth(),
      callId: "call-1",
      sdpAnswer: "v=0 answer-sdp",
    })

    const [, options] = postMock.mock.calls[0]
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      call_id: "call-1",
      action: WhatsappCallGraphAction.accept,
      session: { sdp_type: "answer", sdp: "v=0 answer-sdp" },
    })
    expect(options.json.recording).toBeUndefined()
    expect(options.json.transcription).toBeUndefined()
  })

  it("includes recording and transcription objects (snake_case) when passed", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await acceptCall({
      auth: buildAuth(),
      callId: "call-1",
      sdpAnswer: "v=0 answer-sdp",
      recording: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcementLanguage: "es",
      },
      transcription: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcementLanguage: "es",
      },
    })

    const [, options] = postMock.mock.calls[0]
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      call_id: "call-1",
      action: WhatsappCallGraphAction.accept,
      session: { sdp_type: "answer", sdp: "v=0 answer-sdp" },
      recording: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcement_language: "es",
      },
      transcription: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcement_language: "es",
      },
    })
  })

  it("rejects a purpose longer than 250 characters before posting", async () => {
    await expect(
      acceptCall({
        auth: buildAuth(),
        callId: "call-1",
        sdpAnswer: "v=0 answer-sdp",
        recording: {
          status: "ENABLED",
          purpose: "a".repeat(251),
          announcementLanguage: "en_US",
        },
      }),
    ).rejects.toBeInstanceOf(WhatsappException)

    expect(postMock).not.toHaveBeenCalled()
  })
})

describe("rejectCall", () => {
  it("posts action:reject with no session", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await rejectCall({ auth: buildAuth(), callId: "call-1" })

    const [, options] = postMock.mock.calls[0]
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      call_id: "call-1",
      action: WhatsappCallGraphAction.reject,
    })
    expect(options.json.session).toBeUndefined()
  })
})

describe("terminateCall", () => {
  it("posts action:terminate with no session", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await terminateCall({ auth: buildAuth(), callId: "call-1" })

    const [, options] = postMock.mock.calls[0]
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      call_id: "call-1",
      action: WhatsappCallGraphAction.terminate,
    })
    expect(options.json.session).toBeUndefined()
  })
})

describe("connectCall", () => {
  it("posts action:connect with an offer session, to, and biz_opaque_callback_data — no call_id", async () => {
    postMock.mockReturnValueOnce(
      okResponse({
        messaging_product: "whatsapp",
        calls: [{ id: "wacid.NEW-1" }],
      }),
    )

    const result = await connectCall({
      auth: buildAuth(),
      to: "16315551234",
      sdpOffer: "v=0 offer-sdp",
      attemptId: "attempt-1",
    })

    expect(result).toEqual({ wacid: "wacid.NEW-1" })
    const [url, options] = postMock.mock.calls[0]
    expect(url).toContain("/phone-42/calls")
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      to: "16315551234",
      action: WhatsappCallGraphAction.connect,
      biz_opaque_callback_data: "attempt-1",
      session: { sdp_type: "offer", sdp: "v=0 offer-sdp" },
    })
    expect(options.json.call_id).toBeUndefined()
    expect(options.json.recording).toBeUndefined()
    expect(options.json.transcription).toBeUndefined()
  })

  it("includes recording and transcription objects (snake_case) when passed", async () => {
    postMock.mockReturnValueOnce(
      okResponse({
        messaging_product: "whatsapp",
        calls: [{ id: "wacid.NEW-2" }],
      }),
    )

    await connectCall({
      auth: buildAuth(),
      to: "16315551234",
      sdpOffer: "v=0 offer-sdp",
      attemptId: "attempt-2",
      recording: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcementLanguage: "fr",
      },
      transcription: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcementLanguage: "fr",
      },
    })

    const [, options] = postMock.mock.calls[0]
    expect(options.json).toEqual({
      messaging_product: "whatsapp",
      to: "16315551234",
      action: WhatsappCallGraphAction.connect,
      biz_opaque_callback_data: "attempt-2",
      session: { sdp_type: "offer", sdp: "v=0 offer-sdp" },
      recording: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcement_language: "fr",
      },
      transcription: {
        status: "ENABLED",
        purpose: "quality assurance",
        announcement_language: "fr",
      },
    })
  })

  it("rejects a purpose longer than 250 characters before posting", async () => {
    await expect(
      connectCall({
        auth: buildAuth(),
        to: "16315551234",
        sdpOffer: "v=0 offer-sdp",
        attemptId: "attempt-3",
        transcription: {
          status: "ENABLED",
          purpose: "a".repeat(300),
          announcementLanguage: "en_US",
        },
      }),
    ).rejects.toBeInstanceOf(WhatsappException)

    expect(postMock).not.toHaveBeenCalled()
  })

  it("throws a WhatsappException when Meta's response carries no call id", async () => {
    postMock.mockReturnValueOnce(
      okResponse({ messaging_product: "whatsapp", calls: [] }),
    )

    await expect(
      connectCall({
        auth: buildAuth(),
        to: "16315551234",
        sdpOffer: "v=0 offer-sdp",
        attemptId: "attempt-1",
      }),
    ).rejects.toBeInstanceOf(WhatsappException)
  })

  it("never logs or throws the SDP when connectCall fails", async () => {
    const httpError = makeHttpError(400, {
      error: {
        code: 100,
        message: "Invalid parameter",
        type: "OAuthException",
      },
    })
    postMock.mockReturnValueOnce(errorResponse(httpError))

    let thrown: unknown
    try {
      await connectCall({
        auth: buildAuth(),
        to: "16315551234",
        sdpOffer: SDP_SENTINEL,
        attemptId: "attempt-1",
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(WhatsappException)
    for (const call of mockLogger.error.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SDP_SENTINEL)
    }
    expect(
      JSON.stringify(
        thrown instanceof WhatsappException
          ? thrown.getOriginError()
          : undefined,
      ),
    ).not.toContain(SDP_SENTINEL)
  })
})

describe("SDP redaction on failure", () => {
  it("never logs or throws the SDP when preAcceptCall fails", async () => {
    const httpError = makeHttpError(400, {
      error: {
        code: 100,
        message: "Invalid parameter",
        type: "OAuthException",
      },
    })
    postMock.mockReturnValueOnce(errorResponse(httpError))

    let thrown: unknown
    try {
      await preAcceptCall({
        auth: buildAuth(),
        callId: "call-1",
        sdpAnswer: SDP_SENTINEL,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(WhatsappException)
    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    for (const call of mockLogger.error.mock.calls) {
      const serialized = JSON.stringify(call)
      expect(serialized).not.toContain(SDP_SENTINEL)
      expect(call[0]).toEqual(
        expect.objectContaining({
          callId: "call-1",
          action: WhatsappCallGraphAction.preAccept,
        }),
      )
    }

    expect(
      JSON.stringify(thrown instanceof Error ? thrown.message : thrown),
    ).not.toContain(SDP_SENTINEL)
    if (thrown instanceof WhatsappException) {
      expect(JSON.stringify(thrown.getOriginError())).not.toContain(
        SDP_SENTINEL,
      )
    }
  })

  it("never logs or throws the SDP when acceptCall fails", async () => {
    const httpError = makeHttpError(500, {
      error: { code: 1, message: "Internal error", type: "APIError" },
    })
    postMock.mockReturnValueOnce(errorResponse(httpError))

    let thrown: unknown
    try {
      await acceptCall({
        auth: buildAuth(),
        callId: "call-2",
        sdpAnswer: SDP_SENTINEL,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(WhatsappException)
    for (const call of mockLogger.error.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SDP_SENTINEL)
    }
    expect(
      JSON.stringify(
        thrown instanceof WhatsappException
          ? thrown.getOriginError()
          : undefined,
      ),
    ).not.toContain(SDP_SENTINEL)
  })
})
