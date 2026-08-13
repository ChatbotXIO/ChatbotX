import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  evaluateTemplateSent: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string | undefined, fn: () => Promise<void>) =>
      await fn(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    evaluateTemplateSent: mocks.evaluateTemplateSent,
  },
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))

const { handleEvaluateTemplateSent } = await import(
  "../src/integration/handlers/ads-conversion/evaluate-template-sent"
)

const jobData = {
  workspaceId: "ws-1",
  integrationWhatsappId: "iw-1",
  contactInboxId: "ci-1",
  templateId: "template-1",
}

describe("handleEvaluateTemplateSent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.evaluateTemplateSent.mockResolvedValue([])
  })

  test("wraps template-sent evaluation in the blocked-owner guard", async () => {
    await handleEvaluateTemplateSent(jobData)

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.evaluateTemplateSent).toHaveBeenCalledWith(jobData)
  })

  test("delegates purchase-capable template-sent evaluation unchanged", async () => {
    mocks.evaluateTemplateSent.mockResolvedValue([
      {
        id: "event-1",
        eventType: "purchase",
        currency: null,
        value: null,
      },
    ])

    await handleEvaluateTemplateSent(jobData)

    expect(mocks.evaluateTemplateSent).toHaveBeenCalledWith(jobData)
    await expect(
      mocks.evaluateTemplateSent.mock.results[0]?.value,
    ).resolves.toEqual([
      {
        id: "event-1",
        eventType: "purchase",
        currency: null,
        value: null,
      },
    ])
  })
})
