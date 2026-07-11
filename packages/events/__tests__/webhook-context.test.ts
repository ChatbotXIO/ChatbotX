import { describe, expect, test, vi } from "vitest"
import {
  isWebhookContext,
  runWithWebhookExecutionContext,
} from "../src/context"

describe("webhook execution context", () => {
  test("scopes webhook context to the callback", async () => {
    await vi.waitFor(() => {
      expect(
        runWithWebhookExecutionContext({ source: "webhook" }, () =>
          isWebhookContext(),
        ),
      ).toBe(true)
    })

    expect(
      runWithWebhookExecutionContext({ source: "webhook" }, () =>
        isWebhookContext(),
      ),
    ).toBe(true)
    expect(runWithWebhookExecutionContext({}, () => isWebhookContext())).toBe(
      false,
    )
    expect(isWebhookContext()).toBe(false)
  })
})
