import { describe, expect, test } from "vitest"
import { heavyJobDataSchema } from "../src/queues/heavy"

// `heavyJobDataSchema` is the runtime counterpart of `HeavyJobData`, consumed
// by the integration worker's forward-only shim to *parse* — not cast — an
// untyped legacy job payload still sitting in `bull:integration` after the
// coexist-to-heavy queue cutover. See
// docs/plans/2026-08-30-heavy-worker-coexist-split.md.

describe("heavyJobDataSchema", () => {
  test("accepts a valid coexistWhatsappBuffer payload", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "coexistWhatsappBuffer",
      data: { phoneNumberId: "phone-1", payload: { entry: [] } },
    })

    expect(result.success).toBe(true)
  })

  test("accepts a valid coexistWhatsappFlush payload without runId (webhook-driven buffer flush)", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "coexistWhatsappFlush",
      data: { phoneNumberId: "phone-1" },
    })

    expect(result.success).toBe(true)
  })

  test("accepts a valid coexistWhatsappFlush payload with runId (scheduler/self-continuation)", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "coexistWhatsappFlush",
      data: { runId: "run-1", phoneNumberId: "phone-1" },
    })

    expect(result.success).toBe(true)
  })

  test("accepts a valid coexistMessengerSync payload", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "coexistMessengerSync",
      data: { runId: "run-1", integrationId: "int-1", workspaceId: "ws-1" },
    })

    expect(result.success).toBe(true)
  })

  test("accepts a valid coexistInstagramSync payload", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "coexistInstagramSync",
      data: { runId: "run-1", integrationId: "int-1", workspaceId: "ws-1" },
    })

    expect(result.success).toBe(true)
  })

  test("accepts a valid coexistAttachmentDownload payload for each channel", () => {
    for (const channel of ["messenger", "whatsapp", "instagram"] as const) {
      const result = heavyJobDataSchema.safeParse({
        type: "coexistAttachmentDownload",
        data: {
          attachmentId: "att-1",
          workspaceId: "ws-1",
          channel,
          integrationId: "int-1",
        },
      })

      expect(result.success).toBe(true)
    }
  })

  test("rejects an unrecognized type string", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "incomingMessage",
      data: {},
    })

    expect(result.success).toBe(false)
  })

  test("rejects a coexistAttachmentDownload payload with an invalid channel", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "coexistAttachmentDownload",
      data: {
        attachmentId: "att-1",
        workspaceId: "ws-1",
        channel: "telegram",
        integrationId: "int-1",
      },
    })

    expect(result.success).toBe(false)
  })

  test("rejects a payload missing a required field for its type", () => {
    const result = heavyJobDataSchema.safeParse({
      type: "coexistMessengerSync",
      data: { runId: "run-1", integrationId: "int-1" },
    })

    expect(result.success).toBe(false)
  })

  test("rejects a non-object payload", () => {
    expect(heavyJobDataSchema.safeParse("not-an-object").success).toBe(false)
    expect(heavyJobDataSchema.safeParse(null).success).toBe(false)
    expect(heavyJobDataSchema.safeParse(undefined).success).toBe(false)
  })
})
