import { toPublicErrorMessage } from "@chatbotx.io/business/errors"
import { HTTPError } from "ky"
import { describe, expect, test, vi } from "vitest"
import { rescue } from "../src/exception"

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const FALLBACK = "Something went wrong."

/**
 * Meta's verbatim 138013 body. Pinned rather than paraphrased so a change to
 * the shape Meta sends is a failing test instead of a silently generic toast.
 */
const BUSINESS_CALLING_UNAVAILABLE_BODY = {
  error: {
    message:
      "Business-initiated calling is not available. This may be due to country restrictions or account eligibility.",
    code: 138_013,
    type: "OAuthException",
    error_data: {
      messaging_product: "whatsapp",
      details: "Business initiated calls not available for for this account.",
    },
    error_subcode: 2_593_139,
    is_transient: false,
    error_user_msg:
      "Business-initiated calls not available for for this account.",
    error_user_title: "Business-initiated calling not available",
    fbtrace_id: "A3wDRAu-uGc-mZyKHbJSLle",
  },
}

/**
 * The real shape `getCallPermissions` fails with: a ky `HTTPError` carrying
 * Meta's parsed body, unwrapped by `rescue` into a `WhatsappException`. Going
 * through `rescue` rather than constructing the exception by hand is the point
 * - it exercises `parseOriginError`'s extraction of `error_user_msg`.
 */
const throwLikeMeta = (body: unknown): Promise<never> =>
  rescue(() => {
    const response = new Response(JSON.stringify(body), { status: 400 })
    const error = new HTTPError(
      response,
      new Request("https://graph.facebook.com/v23.0/pnid/call_permissions"),
      // ky's options are an internal normalized shape this test never reads.
      {} as ConstructorParameters<typeof HTTPError>[2],
    )
    // ky exposes the parsed body on `data` for consumers that already read it.
    Object.assign(error, { data: body })
    return Promise.reject(error)
  })

const publicMessageFor = async (body: unknown): Promise<string> => {
  try {
    await throwLikeMeta(body)
  } catch (error) {
    return toPublicErrorMessage(error, FALLBACK)
  }
  throw new Error("expected the call to reject")
}

describe("call permission failure — what the agent actually reads", () => {
  /**
   * Pins WHICH of Meta's three strings ships. `rescue` keeps the raw ky error
   * as `originError`, so `channelErrorMessage` finds no `userMessage` on it and
   * relays `error.message` alone. That is the better sentence here — it names
   * the country/eligibility cause and links Meta's docs, where `error_user_msg`
   * is a bare restatement — but it is behaviour worth failing a test over if it
   * ever changes.
   */
  test("relays Meta's `message`, with its code appended, never the fallback", async () => {
    const message = await publicMessageFor(BUSINESS_CALLING_UNAVAILABLE_BODY)

    expect(message).toBe(
      `${BUSINESS_CALLING_UNAVAILABLE_BODY.error.message} (code 138013)`,
    )
    expect(message).not.toBe(FALLBACK)
  })

  test("a body carrying only a user sentence still reaches the agent", async () => {
    const message = await publicMessageFor({
      error: {
        ...BUSINESS_CALLING_UNAVAILABLE_BODY.error,
        message: undefined,
      },
    })

    expect(message).not.toBe(FALLBACK)
    expect(message).toContain("138013")
  })
})
