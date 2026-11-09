import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { postThreadControl } from "../src/api/thread-control"
import type { WhatsappAuthValue } from "../src/schema"

const NOTE = "Refund approved, card ending 4242"
const auth = {
  tokens: { accessToken: "token" },
  metadata: { phoneNumber: { id: "pn-1" } },
} as unknown as WhatsappAuthValue

const metaRejection = () =>
  new Response(
    JSON.stringify({
      error: { message: "Not allowed", code: 100, fbtrace_id: "trace-1" },
    }),
    { status: 400, headers: { "content-type": "application/json" } },
  )

describe("postThreadControl", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => metaRejection()),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** What the logger sees: pino copies the enumerable keys of the error. */
  const loggedForm = (error: unknown): string => {
    const origin = (error as { getOriginError: () => object }).getOriginError()
    return JSON.stringify(Object.fromEntries(Object.entries(origin)))
  }

  const rejected = () =>
    postThreadControl(auth, {
      messaging_product: "whatsapp",
      to: "84900000001",
      action: "pass",
      metadata: NOTE,
    }).then(
      () => {
        throw new Error("expected Meta's rejection")
      },
      (error: unknown) => error,
    )

  it("keeps the handover note out of the error that gets logged when Meta rejects the call", async () => {
    const error = await rejected()

    expect(loggedForm(error)).not.toContain(NOTE)
  })

  it("still carries Meta's error body, so the fbtrace_id can be logged", async () => {
    const error = await rejected()

    expect(loggedForm(error)).toContain("trace-1")
  })
})
