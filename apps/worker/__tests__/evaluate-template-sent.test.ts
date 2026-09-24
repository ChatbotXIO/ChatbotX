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
  channel: "whatsapp" as const,
  integrationId: "iw-1",
  contactInboxId: "ci-1",
  templateId: "template-1",
}

// The ads-conversion rule engine is hidden and unused. The handler is a
// deliberate no-op (its body is commented out, not deleted) so the jobs
// already sitting in the integration queue drain instantly instead of each
// running an attribution lookup.
describe("handleEvaluateTemplateSent (disabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("completes without evaluating anything", async () => {
    await expect(handleEvaluateTemplateSent(jobData)).resolves.toBeUndefined()

    expect(mocks.evaluateTemplateSent).not.toHaveBeenCalled()
    expect(mocks.withBlockedOwnerGuard).not.toHaveBeenCalled()
  })

  test("never throws, even if the service would", async () => {
    mocks.evaluateTemplateSent.mockRejectedValue(new Error("boom"))

    await expect(handleEvaluateTemplateSent(jobData)).resolves.toBeUndefined()
  })
})
