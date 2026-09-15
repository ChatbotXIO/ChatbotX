import { createHmac } from "node:crypto"
import { describe, expect, test, vi } from "vitest"

const {
  mockLogger,
  mockCaptureConnectOffer,
  mockRejectUnprocessableConnect,
  mockCaptureOutboundAnswer,
  mockCaptureNativeRecordingAvailable,
  mockCaptureNativeTranscriptAvailable,
} = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockCaptureConnectOffer: vi.fn(),
  mockRejectUnprocessableConnect: vi.fn(),
  mockCaptureOutboundAnswer: vi.fn(),
  mockCaptureNativeRecordingAvailable: vi.fn(),
  mockCaptureNativeTranscriptAvailable: vi.fn(),
}))

type MiddlewareHandlers = {
  message?: (args: unknown) => void
  sent?: () => void
  status?: (args: unknown) => void
}

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipCallService: {
    captureConnectOffer: mockCaptureConnectOffer,
    rejectUnprocessableConnect: mockRejectUnprocessableConnect,
    captureOutboundAnswer: mockCaptureOutboundAnswer,
    captureNativeRecordingAvailable: mockCaptureNativeRecordingAvailable,
    captureNativeTranscriptAvailable: mockCaptureNativeTranscriptAvailable,
  },
}))

// Shared spy so a test can assert whether the SDK middleware was invoked at
// all — a `calls` webhook must NOT be fed to it (whatsapp-api-js@6.2.1 crashes
// on a calls contact that has no `profile`).
const { middlewareHandlePost } = vi.hoisted(() => ({
  middlewareHandlePost: vi.fn(),
}))

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: MiddlewareHandlers = {}

    get = vi.fn()

    handle_post(...args: unknown[]): Promise<number> {
      middlewareHandlePost(...args)
      queueMicrotask(() => {
        this.on.sent?.()
      })
      return Promise.resolve(200)
    }
  },
}))

const { extractCallEventPayloads } = await import("../src/lib/calls")
const { webhookHandler } = await import("../src/handlers/webhook")

const CLIENT_SECRET = "test-app-secret"

const sign = (rawBody: string): string =>
  `sha256=${createHmac("sha256", CLIENT_SECRET).update(rawBody, "utf8").digest("hex")}`

const makeSignedPostRequest = (payload: unknown): Request => {
  const body = JSON.stringify(payload)
  return new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": sign(body) },
    body,
  })
}

const callsValue = (overrides: Record<string, unknown> = {}) => ({
  messaging_product: "whatsapp",
  metadata: {
    display_phone_number: "16505551111",
    phone_number_id: "phone-1",
  },
  contacts: [
    {
      profile: { name: "Kerry Fisher" },
      wa_id: "16315551234",
    },
  ],
  ...overrides,
})

const wrapEntry = (value: unknown) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba-1", changes: [{ field: "calls", value }] }],
})

describe("extractCallEventPayloads", () => {
  test("normalizes a user-initiated connect event", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.ABC-123",
              from: "16315551234",
              to: "16505551111",
              event: "connect",
              timestamp: "1755700000",
              direction: "USER_INITIATED",
              session: { sdp_type: "offer", sdp: "v=0..." },
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: {
          waId: "16315551234",
          userId: undefined,
          name: "Kerry Fisher",
        },
        event: {
          kind: "connect",
          wacid: "wacid.ABC-123",
          direction: "userInitiated",
          from: "16315551234",
          to: "16505551111",
          timestamp: "1755700000",
          session: { sdpType: "offer", sdp: "v=0..." },
          sessionInvalid: false,
        },
      },
    ])
  })

  test("normalizes a completed terminate event with duration", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.ABC-123",
              from: "16315551234",
              to: "16505551111",
              event: "terminate",
              direction: "USER_INITIATED",
              timestamp: "1755700100",
              status: "COMPLETED",
              start_time: "1755700010",
              end_time: "1755700100",
              duration: 90,
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: {
          waId: "16315551234",
          userId: undefined,
          name: "Kerry Fisher",
        },
        event: {
          kind: "terminate",
          wacid: "wacid.ABC-123",
          direction: "userInitiated",
          status: "COMPLETED",
          from: "16315551234",
          to: "16505551111",
          timestamp: "1755700100",
          startTime: "1755700010",
          endTime: "1755700100",
          durationSeconds: 90,
        },
      },
    ])
  })

  test("normalizes interim statuses and skips unknown ones", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          contacts: undefined,
          statuses: [
            {
              id: "wacid.ABC-123",
              type: "call",
              status: "RINGING",
              timestamp: "1755700001",
              recipient_id: "16315551234",
            },
            {
              id: "wacid.ABC-123",
              type: "call",
              status: "SOMETHING_NEW",
              timestamp: "1755700002",
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: undefined,
        event: {
          kind: "status",
          wacid: "wacid.ABC-123",
          status: "RINGING",
          recipientId: "16315551234",
          timestamp: "1755700001",
        },
      },
    ])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { wacid: "wacid.ABC-123", status: "SOMETHING_NEW" },
      "Whatsapp call status skipped: unknown status",
    )
  })

  test("keeps a connect event with no session unchanged (existing SIP behavior)", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.SIP-1",
              from: "16315551234",
              to: "16505551111",
              event: "connect",
              timestamp: "1755700000",
              direction: "USER_INITIATED",
            },
          ],
        }),
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0].event).toEqual({
      kind: "connect",
      wacid: "wacid.SIP-1",
      direction: "userInitiated",
      from: "16315551234",
      to: "16505551111",
      timestamp: "1755700000",
      sessionInvalid: false,
    })
    expect((result[0].event as { session?: unknown }).session).toBeUndefined()
  })

  test("flags a session missing sdp as invalid (VoIP connect to be Meta-rejected)", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.NO-SDP",
              event: "connect",
              direction: "USER_INITIATED",
              from: "16315551234",
              session: { sdp_type: "offer" },
            },
          ],
        }),
      ),
    )

    expect(result).toHaveLength(1)
    expect((result[0].event as { session?: unknown }).session).toBeUndefined()
    expect(
      (result[0].event as { sessionInvalid?: boolean }).sessionInvalid,
    ).toBe(true)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.NO-SDP" }),
      "Whatsapp call session invalid: malformed session",
    )
  })

  test("rejects a session with the wrong sdp_type", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.WRONG-TYPE",
              event: "connect",
              direction: "USER_INITIATED",
              from: "16315551234",
              session: { sdp_type: "answer", sdp: "v=0..." },
            },
          ],
        }),
      ),
    )

    expect(result).toHaveLength(1)
    expect((result[0].event as { session?: unknown }).session).toBeUndefined()
    expect(
      (result[0].event as { sessionInvalid?: boolean }).sessionInvalid,
    ).toBe(true)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.WRONG-TYPE" }),
      "Whatsapp call session invalid: malformed session",
    )
  })

  test("rejects an oversized SDP offer without throwing", () => {
    const oversizedSdp = "a".repeat(100_001)
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.OVERSIZED",
              event: "connect",
              direction: "USER_INITIATED",
              from: "16315551234",
              session: { sdp_type: "offer", sdp: oversizedSdp },
            },
          ],
        }),
      ),
    )

    expect(result).toHaveLength(1)
    expect((result[0].event as { session?: unknown }).session).toBeUndefined()
    expect(
      (result[0].event as { sessionInvalid?: boolean }).sessionInvalid,
    ).toBe(true)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { wacid: "wacid.OVERSIZED", sdpLength: oversizedSdp.length },
      "Whatsapp call session invalid: SDP offer exceeds size limit",
    )
  })

  test("normalizes a call_recording_available event (call_recording.audio nesting)", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.REC-1",
              event: "call_recording_available",
              direction: "USER_INITIATED",
              call_recording: {
                type: "audio",
                audio: {
                  id: "media-rec-1",
                  sha256: "sha-rec-1",
                  mime_type: "audio/ogg; codecs=opus",
                  url: "https://lookaside.fbsbx.com/rec-1",
                },
              },
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: {
          waId: "16315551234",
          userId: undefined,
          name: "Kerry Fisher",
        },
        event: {
          kind: "recordingAvailable",
          wacid: "wacid.REC-1",
          audio: {
            mediaId: "media-rec-1",
            sha256: "sha-rec-1",
            mimeType: "audio/ogg; codecs=opus",
            url: "https://lookaside.fbsbx.com/rec-1",
          },
          direction: "userInitiated",
          bizOpaqueCallbackData: undefined,
        },
      },
    ])
  })

  test("skips a call_recording_available event with no call_recording object", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.REC-MISSING",
              event: "call_recording_available",
              direction: "USER_INITIATED",
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { wacid: "wacid.REC-MISSING", event: "call_recording_available" },
      "Whatsapp call recording-available skipped: missing call_recording",
    )
  })

  test("normalizes a call_transcription_available event (call_transcript.document nesting)", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.TRX-1",
              event: "call_transcription_available",
              call_transcript: {
                document: {
                  id: "media-doc-1",
                  sha256: "sha-doc-1",
                  mime_type: "application/json",
                  url: "https://lookaside.fbsbx.com/doc-1",
                },
              },
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: {
          waId: "16315551234",
          userId: undefined,
          name: "Kerry Fisher",
        },
        event: {
          kind: "transcriptionAvailable",
          wacid: "wacid.TRX-1",
          document: {
            mediaId: "media-doc-1",
            sha256: "sha-doc-1",
            mimeType: "application/json",
            url: "https://lookaside.fbsbx.com/doc-1",
          },
        },
      },
    ])
  })

  test("skips a call_transcription_available event with no call_transcript object", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.TRX-MISSING",
              event: "call_transcription_available",
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { wacid: "wacid.TRX-MISSING", event: "call_transcription_available" },
      "Whatsapp call transcription-available skipped: missing call_transcript",
    )
  })

  test("ignores non-calls fields and malformed values without throwing", () => {
    expect(
      extractCallEventPayloads({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba-1",
            changes: [
              {
                field: "messages",
                value: { metadata: { phone_number_id: "phone-1" } },
              },
              { field: "calls", value: "garbage" },
              { field: "calls", value: { metadata: {} } },
            ],
          },
        ],
      }),
    ).toEqual([])
  })
})

describe("webhookHandler call events", () => {
  test("enqueues one deduplicated BullMQ job per call event", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.ABC:123",
            from: "16315551234",
            to: "16505551111",
            event: "connect",
            timestamp: "1755700000",
            direction: "USER_INITIATED",
          },
        ],
        statuses: [
          {
            id: "wacid.ABC:123",
            type: "call",
            status: "RINGING",
            timestamp: "1755700001",
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledTimes(2)
    // Interim statuses enqueue BEFORE call events so a REJECTED status can
    // land before its terminate job runs.
    expect(queueAdd).toHaveBeenNthCalledWith(
      1,
      "whatsappCallEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            event: expect.objectContaining({
              kind: "status",
              status: "RINGING",
            }),
          }),
        }),
      }),
      // BullMQ forbids ":" in custom job ids — the wacid must be sanitized.
      expect.objectContaining({
        jobId: "wa-call-wacid.ABC_123-status-RINGING",
        attempts: 5,
      }),
    )
    expect(queueAdd).toHaveBeenNthCalledWith(
      2,
      "whatsappCallEvent",
      expect.objectContaining({
        type: "whatsappCallEvent",
        data: expect.objectContaining({
          integrationType: "whatsapp",
          integrationIdentifier: "phone-1",
          payload: expect.objectContaining({
            event: expect.objectContaining({
              kind: "connect",
              wacid: "wacid.ABC:123",
            }),
          }),
        }),
      }),
      expect.objectContaining({ jobId: "wa-call-wacid.ABC_123-connect" }),
    )

    for (const call of queueAdd.mock.calls) {
      expect(call[2].jobId).not.toContain(":")
    }
  })

  test("keeps acknowledging when one enqueue fails", async () => {
    const queueAdd = vi
      .fn()
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce(undefined)
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.A",
            event: "connect",
            direction: "USER_INITIATED",
            from: "16315551234",
          },
          {
            id: "wacid.B",
            event: "terminate",
            direction: "USER_INITIATED",
            status: "FAILED",
            from: "16315551234",
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledTimes(2)
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.A" }),
      "Whatsapp call event enqueue failed; webhook will still acknowledge",
    )
    // Terminate jobs are delayed so same-batch interim statuses commit first.
    expect(queueAdd).toHaveBeenNthCalledWith(
      2,
      "whatsappCallEvent",
      expect.anything(),
      expect.objectContaining({
        jobId: "wa-call-wacid.B-terminate",
        delay: 2000,
      }),
    )
  })
})

describe("webhookHandler VoIP-mode connect signaling", () => {
  test("a validated SDP offer both enqueues the generic (session-stripped) job AND captures the offer via the VoIP signaling service — the SDP never reaches the generic job", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.VOIP-1",
            from: "16315551234",
            to: "16505551111",
            event: "connect",
            timestamp: "1755700000",
            direction: "USER_INITIATED",
            session: { sdp_type: "offer", sdp: "v=0...SENSITIVE_SDP..." },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    // The generic `whatsappCallEvent` job still fires (ringing row + trigger
    // stay unchanged) but must never carry the session/SDP.
    expect(queueAdd).toHaveBeenCalledTimes(1)
    const [, jobData] = queueAdd.mock.calls[0]
    expect(JSON.stringify(jobData)).not.toContain("SENSITIVE_SDP")
    expect(
      (
        jobData as {
          data: { payload: { event: { session?: unknown } } }
        }
      ).data.payload.event.session,
    ).toBeUndefined()

    // The SDP goes ONLY through the VoIP signaling service (Redis + slim job).
    expect(mockCaptureConnectOffer).toHaveBeenCalledWith({
      wacid: "wacid.VOIP-1",
      sdp: "v=0...SENSITIVE_SDP...",
      phoneNumberId: "phone-1",
    })
  })

  test("a connect with no session never calls the VoIP signaling service (existing SIP behavior)", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.SIP-1",
            from: "16315551234",
            event: "connect",
            direction: "USER_INITIATED",
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(mockCaptureConnectOffer).not.toHaveBeenCalled()
  })

  test("a VoIP signaling failure is logged and the webhook still acknowledges", async () => {
    mockCaptureConnectOffer.mockRejectedValueOnce(new Error("redis down"))
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.VOIP-2",
            from: "16315551234",
            event: "connect",
            direction: "USER_INITIATED",
            session: { sdp_type: "offer", sdp: "v=0..." },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.VOIP-2" }),
      "Whatsapp VoIP connect signaling enqueue failed; webhook will still acknowledge",
    )
  })

  test("a business-initiated connect carrying the user's answer forwards it via captureOutboundAnswer, never the inbound offer path", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.OUT-1",
            from: "16505551111",
            to: "16315551234",
            event: "connect",
            direction: "BUSINESS_INITIATED",
            biz_opaque_callback_data: "attempt-1",
            session: { sdp_type: "answer", sdp: "v=0...ANSWER_SDP..." },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    // The generic (session-stripped) job still fires — the ringing row /
    // call-log lifecycle for outbound calls is unaffected by this guard.
    expect(queueAdd).toHaveBeenCalledTimes(1)
    expect(mockCaptureConnectOffer).not.toHaveBeenCalled()
    expect(mockRejectUnprocessableConnect).not.toHaveBeenCalled()
    expect(mockCaptureOutboundAnswer).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      wacid: "wacid.OUT-1",
      sdp: "v=0...ANSWER_SDP...",
    })
  })

  test("a business-initiated answer with no bizOpaqueCallbackData falls back to an empty attemptId (wacid lookup) and logs a warning", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.OUT-2",
            from: "16505551111",
            to: "16315551234",
            event: "connect",
            direction: "BUSINESS_INITIATED",
            session: { sdp_type: "answer", sdp: "v=0...ANSWER_SDP..." },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(mockCaptureOutboundAnswer).toHaveBeenCalledWith({
      attemptId: "",
      wacid: "wacid.OUT-2",
      sdp: "v=0...ANSWER_SDP...",
    })
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.OUT-2" }),
      "Whatsapp outbound answer: bizOpaqueCallbackData missing; falling back to wacid lookup",
    )
  })

  test("a captureOutboundAnswer failure is logged and the webhook still acknowledges", async () => {
    mockCaptureOutboundAnswer.mockRejectedValueOnce(new Error("redis down"))
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.OUT-3",
            from: "16505551111",
            to: "16315551234",
            event: "connect",
            direction: "BUSINESS_INITIATED",
            biz_opaque_callback_data: "attempt-3",
            session: { sdp_type: "answer", sdp: "v=0...ANSWER_SDP..." },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.OUT-3" }),
      "Whatsapp outbound answer capture failed; webhook will still acknowledge",
    )
  })

  test("a calls webhook (contact WITHOUT a profile) is never fed to the SDK middleware and still ACKs — guards the whatsapp-api-js profile-less-contact crash", async () => {
    middlewareHandlePost.mockClear()
    const queueAdd = vi.fn()
    // The exact production shape: a business-initiated answer whose contact
    // carries only { wa_id, user_id } and NO `profile`. whatsapp-api-js@6.2.1's
    // `post()` reads `contact?.profile.name`, which throws on this shape and
    // used to 400 the whole webhook. We must not route a calls webhook through
    // the middleware at all.
    const payload = wrapEntry(
      callsValue({
        contacts: [{ wa_id: "84339426550", user_id: "VN.1535008571702152" }],
        calls: [
          {
            id: "wacid.OUT-NOPROFILE",
            from: "6287744910069",
            to: "84339426550",
            event: "connect",
            direction: "BUSINESS_INITIATED",
            biz_opaque_callback_data: "attempt-noprofile",
            session: { sdp_type: "answer", sdp: "v=0...ANSWER_SDP..." },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    // The SDK middleware is skipped entirely for a calls webhook…
    expect(middlewareHandlePost).not.toHaveBeenCalled()
    // …while our own outbound-answer handling still runs.
    expect(mockCaptureOutboundAnswer).toHaveBeenCalledWith({
      attemptId: "attempt-noprofile",
      wacid: "wacid.OUT-NOPROFILE",
      sdp: "v=0...ANSWER_SDP...",
    })
  })

  test("a non-calls (message) webhook DOES still run the SDK middleware", async () => {
    middlewareHandlePost.mockClear()
    const queueAdd = vi.fn()
    const messagePayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "16505551111",
                  phone_number_id: "phone-1",
                },
                contacts: [
                  { profile: { name: "Kerry" }, wa_id: "16315551234" },
                ],
                messages: [
                  {
                    from: "16315551234",
                    id: "wamid.1",
                    timestamp: "1755700000",
                    type: "text",
                    text: { body: "hi" },
                  },
                ],
              },
            },
          ],
        },
      ],
    }

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(messagePayload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(middlewareHandlePost).toHaveBeenCalledTimes(1)
  })
})

describe("webhookHandler Meta-native call recording/transcript capture", () => {
  test("a call_recording_available webhook calls captureNativeRecordingAvailable with the parsed audio ids/url and still ACKs", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.REC-1",
            event: "call_recording_available",
            direction: "USER_INITIATED",
            call_recording: {
              type: "audio",
              audio: {
                id: "media-rec-1",
                sha256: "sha-rec-1",
                mime_type: "audio/ogg; codecs=opus",
                url: "https://lookaside.fbsbx.com/rec-1",
              },
            },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    // The generic `whatsappCallEvent` job still fires alongside the capture.
    expect(queueAdd).toHaveBeenCalledTimes(1)
    expect(mockCaptureNativeRecordingAvailable).toHaveBeenCalledWith({
      wacid: "wacid.REC-1",
      audioMediaId: "media-rec-1",
      audioUrl: "https://lookaside.fbsbx.com/rec-1",
      mimeType: "audio/ogg; codecs=opus",
    })
    expect(mockCaptureNativeTranscriptAvailable).not.toHaveBeenCalled()
  })

  test("a call_transcription_available webhook calls captureNativeTranscriptAvailable with the parsed document ids/url and still ACKs", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.TRX-1",
            event: "call_transcription_available",
            call_transcript: {
              document: {
                id: "media-doc-1",
                sha256: "sha-doc-1",
                mime_type: "application/json",
                url: "https://lookaside.fbsbx.com/doc-1",
              },
            },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledTimes(1)
    expect(mockCaptureNativeTranscriptAvailable).toHaveBeenCalledWith({
      wacid: "wacid.TRX-1",
      documentMediaId: "media-doc-1",
      documentUrl: "https://lookaside.fbsbx.com/doc-1",
    })
    expect(mockCaptureNativeRecordingAvailable).not.toHaveBeenCalled()
  })

  test("a captureNativeRecordingAvailable failure is logged and the webhook still acknowledges", async () => {
    mockCaptureNativeRecordingAvailable.mockRejectedValueOnce(
      new Error("db down"),
    )
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.REC-2",
            event: "call_recording_available",
            direction: "USER_INITIATED",
            call_recording: {
              type: "audio",
              audio: {
                id: "media-rec-2",
                sha256: "sha-rec-2",
                mime_type: "audio/ogg; codecs=opus",
                url: "https://lookaside.fbsbx.com/rec-2",
              },
            },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.REC-2" }),
      "Whatsapp native call recording capture failed; webhook will still acknowledge",
    )
  })

  test("a captureNativeTranscriptAvailable failure is logged and the webhook still acknowledges", async () => {
    mockCaptureNativeTranscriptAvailable.mockRejectedValueOnce(
      new Error("db down"),
    )
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.TRX-2",
            event: "call_transcription_available",
            call_transcript: {
              document: {
                id: "media-doc-2",
                sha256: "sha-doc-2",
                mime_type: "application/json",
                url: "https://lookaside.fbsbx.com/doc-2",
              },
            },
          },
        ],
      }),
    )

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
        req: makeSignedPostRequest(payload),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.TRX-2" }),
      "Whatsapp native call transcript capture failed; webhook will still acknowledge",
    )
  })
})
