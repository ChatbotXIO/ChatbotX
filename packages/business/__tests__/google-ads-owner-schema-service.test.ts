import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWorkspace: vi.fn(),
  findTenant: vi.fn(),
  findWorkspaceEvent: vi.fn(),
  redrive: vi.fn(),
  enqueueSend: vi.fn(),
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))
vi.mock("../src/enterprise/tenant/service", () => ({
  tenantService: { findById: mocks.findTenant },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  googleAdsConversionEventRepository: {
    findWorkspaceEvent: mocks.findWorkspaceEvent,
    redrive: mocks.redrive,
  },
}))
vi.mock("../src/google-ads/send-queue", () => ({
  enqueueSend: mocks.enqueueSend,
  isSendJobLive: vi.fn(),
}))
vi.mock("../src/google-ads/delivery", () => ({
  deliverGoogleAdsConversion: vi.fn(),
}))
vi.mock("../src/google-ads/housekeeping", () => ({
  pollGoogleAdsProcessingStatus: vi.fn(),
  sweepStrandedGoogleAdsEvents: vi.fn(),
  syncGoogleAdsSetups: vi.fn(),
}))
vi.mock("../src/google-ads/record-conversion", () => ({
  recordGoogleAdsConversion: vi.fn(),
}))

const { resolveCredentialOwnerIdForWorkspace } = await import(
  "../src/google-ads/owner"
)
const { conversionValueSchema } = await import("../src/google-ads/schema")
const { googleAdsConversionService } = await import("../src/google-ads/service")

describe("resolveCredentialOwnerIdForWorkspace", () => {
  beforeEach(() => vi.resetAllMocks())

  test("throws when the workspace does not exist", async () => {
    mocks.findWorkspace.mockResolvedValue(undefined)
    await expect(resolveCredentialOwnerIdForWorkspace("ws-1")).rejects.toThrow(
      "Workspace not found",
    )
  })

  test("uses the workspace owner on the root tenant", async () => {
    mocks.findWorkspace.mockResolvedValue({ tenantId: "1", ownerId: "owner-1" })
    expect(await resolveCredentialOwnerIdForWorkspace("ws-1")).toBe("owner-1")
    expect(mocks.findTenant).not.toHaveBeenCalled()
  })

  test("uses the reseller tenant owner on a reseller tenant", async () => {
    mocks.findWorkspace.mockResolvedValue({ tenantId: "7", ownerId: "owner-1" })
    mocks.findTenant.mockResolvedValue({ ownerId: "reseller-1" })
    expect(await resolveCredentialOwnerIdForWorkspace("ws-1")).toBe(
      "reseller-1",
    )
    expect(mocks.findTenant).toHaveBeenCalledWith("7")
  })

  test("falls back to the workspace owner when the tenant has no owner", async () => {
    mocks.findWorkspace.mockResolvedValue({ tenantId: "7", ownerId: "owner-1" })
    mocks.findTenant.mockResolvedValue({ ownerId: null })
    expect(await resolveCredentialOwnerIdForWorkspace("ws-1")).toBe("owner-1")
    mocks.findTenant.mockResolvedValue(undefined)
    expect(await resolveCredentialOwnerIdForWorkspace("ws-1")).toBe("owner-1")
  })
})

describe("conversionValueSchema", () => {
  test("accepts value with currency", () => {
    expect(
      conversionValueSchema.safeParse({ value: "10.5", currency: "USD" })
        .success,
    ).toBe(true)
  })

  test("accepts neither", () => {
    expect(conversionValueSchema.safeParse({}).success).toBe(true)
  })

  test("rejects value without currency and currency without value", () => {
    expect(conversionValueSchema.safeParse({ value: "10" }).success).toBe(false)
    expect(conversionValueSchema.safeParse({ currency: "USD" }).success).toBe(
      false,
    )
  })

  test("rejects an invalid currency", () => {
    expect(
      conversionValueSchema.safeParse({ value: "10", currency: "dollars" })
        .success,
    ).toBe(false)
  })
})

describe("googleAdsConversionService.retry", () => {
  beforeEach(() => vi.resetAllMocks())
  const ref = { id: "evt-1", workspaceId: "ws-1" }

  test("is not retryable when the event does not exist", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(undefined)
    expect(await googleAdsConversionService.retry(ref)).toEqual({
      status: "notRetryable",
    })
  })

  test.each([
    "pending",
    "sending",
    "sent",
    "processed",
  ])("is not retryable from %s", async (status) => {
    mocks.findWorkspaceEvent.mockResolvedValue({ ...ref, status, attempt: 1 })
    expect(await googleAdsConversionService.retry(ref)).toEqual({
      status: "notRetryable",
    })
    expect(mocks.redrive).not.toHaveBeenCalled()
  })

  test("is not retryable when the redrive lost the race", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...ref,
      status: "failed",
      attempt: 2,
    })
    mocks.redrive.mockResolvedValue(null)
    expect(await googleAdsConversionService.retry(ref)).toEqual({
      status: "notRetryable",
    })
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("redrives a failed event as a new generation and enqueues it", async () => {
    const redriven = {
      ...ref,
      attempt: 3,
      googleClickReceivedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    }
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...ref,
      status: "failed",
      attempt: 2,
    })
    mocks.redrive.mockResolvedValue(redriven)

    expect(await googleAdsConversionService.retry(ref)).toEqual({
      status: "retried",
    })
    expect(mocks.redrive).toHaveBeenCalledWith({
      ...ref,
      fromStatuses: ["failed"],
      expectedAttempt: 2,
    })
    expect(mocks.enqueueSend).toHaveBeenCalledWith(redriven, 3, 0)
  })
})
