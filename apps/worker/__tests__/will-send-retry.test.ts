import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, it } from "vitest"
import { willSendRetry } from "../src/chat/utils/retry"

const networkError = () =>
  new ChannelError("socket hang up", ChannelErrorCategory.NETWORK_ERROR)

const rateLimited = () =>
  new ChannelError("slow down", ChannelErrorCategory.RATE_LIMITED)

describe("willSendRetry", () => {
  it("is false once nothing follows this emission", () => {
    expect(
      willSendRetry({
        error: rateLimited(),
        channel: "whatsapp",
        willRetryOnThrow: false,
      }),
    ).toBe(false)
  })

  it("is true while an attempt is still in hand", () => {
    expect(
      willSendRetry({
        error: rateLimited(),
        channel: "whatsapp",
        willRetryOnThrow: true,
      }),
    ).toBe(true)
  })

  // The send is abandoned rather than rethrown, so no retry ever happens and
  // the message is never delivered — the failure has to be recorded here even
  // though `isRetryable` is true and attempts remain.
  it("is false for a Messenger network error, which is suppressed not rethrown", () => {
    const error = networkError()
    expect(error.isRetryable).toBe(true)

    expect(
      willSendRetry({ error, channel: "messenger", willRetryOnThrow: true }),
    ).toBe(false)
  })

  // Only Messenger and Instagram sends are non-idempotent enough to abandon;
  // elsewhere the same error is rethrown and retried normally.
  it("keeps retrying the same network error on a channel that is safe to retry", () => {
    expect(
      willSendRetry({
        error: networkError(),
        channel: "whatsapp",
        willRetryOnThrow: true,
      }),
    ).toBe(true)
  })
})
