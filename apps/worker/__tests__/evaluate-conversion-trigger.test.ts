import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  evaluateConversionTrigger: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string | undefined, fn: () => Promise<void>) =>
      await fn(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    evaluateConversionTrigger: mocks.evaluateConversionTrigger,
  },
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))

const { handleEvaluateConversionTrigger } = await import(
  "../src/integration/handlers/ads-conversion/evaluate-conversion-trigger"
)

const jobData = {
  workspaceId: "ws-1",
  integrationWhatsappId: "iw-1",
  contactInboxId: "ci-1",
  occurrence: { type: "tagApplied" as const, tagId: "tag-1" },
}

describe("handleEvaluateConversionTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.evaluateConversionTrigger.mockResolvedValue([])
  })

  test("wraps conversion-trigger evaluation in the blocked-owner guard", async () => {
    await handleEvaluateConversionTrigger(jobData)

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.evaluateConversionTrigger).toHaveBeenCalledWith(jobData)
  })
})
