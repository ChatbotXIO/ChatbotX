import type { Job } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(),
  guard: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  googleAdsConversionService: { deliver: mocks.deliver },
  withBlockedOwnerGuard: (workspaceId: string, fn: () => Promise<unknown>) =>
    mocks.guard(workspaceId, fn),
}))

const { handleSendGoogleAdsConversion } = await import(
  "../src/integration/handlers/google-ads/send-conversion"
)

const DATA = {
  googleAdsConversionEventId: "evt-1",
  workspaceId: "ws-1",
  attempt: 3,
}

const fakeJob = (attemptsMade: number, attempts?: number) =>
  ({
    attemptsMade,
    opts: attempts === undefined ? {} : { attempts },
  }) as unknown as Job

beforeEach(() => {
  vi.resetAllMocks()
  mocks.guard.mockImplementation(
    (_workspaceId: string, fn: () => Promise<unknown>) => fn(),
  )
  mocks.deliver.mockResolvedValue(undefined)
})

describe("handleSendGoogleAdsConversion", () => {
  test("delivers the event generation under the workspace guard", async () => {
    await handleSendGoogleAdsConversion(DATA, fakeJob(0, 2))

    expect(mocks.guard).toHaveBeenCalledWith("ws-1", expect.any(Function))
    expect(mocks.deliver).toHaveBeenCalledWith({
      eventId: "evt-1",
      workspaceId: "ws-1",
      attempt: 3,
      isLastInJobAttempt: false,
      // Resolves the customer-matching variables against the contact at delivery.
      resolveMatchingTemplates: expect.any(Function),
    })
  })

  test("isLastInJobAttempt is true only on the final BullMQ attempt", async () => {
    await handleSendGoogleAdsConversion(DATA, fakeJob(1, 2))
    expect(mocks.deliver).toHaveBeenLastCalledWith(
      expect.objectContaining({ isLastInJobAttempt: true }),
    )
  })

  test("a job without an attempts option is always its final attempt", async () => {
    await handleSendGoogleAdsConversion(DATA, fakeJob(0))
    expect(mocks.deliver).toHaveBeenLastCalledWith(
      expect.objectContaining({ isLastInJobAttempt: true }),
    )
  })

  test("does not deliver when the owner is blocked", async () => {
    mocks.guard.mockResolvedValue(undefined)
    await expect(
      handleSendGoogleAdsConversion(DATA, fakeJob(1, 2)),
    ).resolves.toBeUndefined()
    expect(mocks.deliver).not.toHaveBeenCalled()
  })

  test("propagates a delivery error so BullMQ retries", async () => {
    mocks.deliver.mockRejectedValue(new Error("boom"))
    await expect(
      handleSendGoogleAdsConversion(DATA, fakeJob(0, 2)),
    ).rejects.toThrow("boom")
  })
})
