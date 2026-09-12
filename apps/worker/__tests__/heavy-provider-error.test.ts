import { beforeEach, describe, expect, it, vi } from "vitest"

const logProviderError = vi.fn()

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: (input: unknown) => logProviderError(input),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const { recordHeavyAIStepProviderError } = await import(
  "../src/heavy/handlers/provider-error"
)

describe("recordHeavyAIStepProviderError", () => {
  beforeEach(() => {
    logProviderError.mockReset()
  })

  // Regression: this handler used to hand `normalizeError(input.error)` to the
  // service, which returns a plain object. `resolveStackFrames` bails on
  // anything that is not an `Error`, so every heavy AI-step failure wrote
  // `stackTrace = NULL` even though the worker's catch had the real stack.
  it("forwards the thrown Error itself, not a normalized copy", async () => {
    const error = new Error("boom")

    await recordHeavyAIStepProviderError({
      contactId: "contact-1",
      sourceId: "source-1",
      error,
      provider: "openai",
      workspaceId: "workspace-1",
    })

    expect(logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        workspaceId: "workspace-1",
        contactId: "contact-1",
        sourceId: "source-1",
        error,
      }),
    )
    const [{ error: forwarded }] = logProviderError.mock.calls[0]
    expect(forwarded).toBeInstanceOf(Error)
    expect((forwarded as Error).stack).toBe(error.stack)
  })

  // The service is the only thing allowed to throw here; a failed error log
  // must never take down the job that was already failing.
  it("swallows a failure from the service", async () => {
    logProviderError.mockRejectedValueOnce(new Error("stream down"))

    await expect(
      recordHeavyAIStepProviderError({
        contactId: "contact-1",
        error: new Error("boom"),
        provider: "openai",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()
  })
})
