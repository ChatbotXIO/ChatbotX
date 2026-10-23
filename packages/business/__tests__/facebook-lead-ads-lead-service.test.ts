import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const insertBuilder = {
    values: vi.fn(() => insertBuilder),
    onConflictDoNothing: vi.fn(() => insertBuilder),
    returning: vi.fn(async () => [{ id: "claim-1" }]),
  }
  const updateBuilder = {
    set: vi.fn(() => updateBuilder),
    where: vi.fn(async () => undefined),
  }
  return {
    insertBuilder,
    updateBuilder,
    findFirst: vi.fn(),
    insert: vi.fn(() => insertBuilder),
    update: vi.fn(() => updateBuilder),
  }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return {
    ...actual,
    db: {
      query: { facebookLeadAdsLeadModel: { findFirst: mocks.findFirst } },
      insert: mocks.insert,
      update: mocks.update,
    },
  }
})

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((callback) => callback),
  invalidateCacheByTags: vi.fn(async () => undefined),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

const { facebookLeadAdsLeadService } = await import(
  "../src/facebook-lead-ads-automation/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insertBuilder.returning.mockResolvedValue([{ id: "claim-1" }])
})

describe("facebookLeadAdsLeadService.claim", () => {
  test("stores the form, form name and adgroup known at webhook time", async () => {
    const claim = await facebookLeadAdsLeadService.claim({
      automationId: "auto-1",
      leadgenId: "lead-1",
      formId: "form-1",
      formName: "Summer promo",
      adgroupId: "adgroup-1",
    })

    expect(claim).toEqual({ id: "claim-1" })
    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "auto-1",
        leadgenId: "lead-1",
        formId: "form-1",
        formName: "Summer promo",
        adgroupId: "adgroup-1",
      }),
    )
  })

  test("stores nulls for the optional metadata that is absent", async () => {
    await facebookLeadAdsLeadService.claim({
      automationId: "auto-1",
      leadgenId: "lead-1",
      formId: "form-1",
    })

    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ formName: null, adgroupId: null }),
    )
  })

  test("returns null for a re-delivered lead (conflict inserts nothing)", async () => {
    mocks.insertBuilder.returning.mockResolvedValue([])

    await expect(
      facebookLeadAdsLeadService.claim({
        automationId: "auto-1",
        leadgenId: "lead-1",
        formId: "form-1",
      }),
    ).resolves.toBeNull()
  })
})

describe("facebookLeadAdsLeadService.setFormName", () => {
  test("updates only the form name of the claimed lead", async () => {
    await facebookLeadAdsLeadService.setFormName({
      id: "claim-1",
      formName: "Winter promo",
    })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({
      formName: "Winter promo",
    })
  })
})

describe("facebookLeadAdsLeadService.findLatestByContact", () => {
  test("reads the newest lead of the contact, scoped to the workspace", async () => {
    mocks.findFirst.mockResolvedValue({
      leadgenId: "lead-9",
      formId: "form-3",
      formName: null,
      adgroupId: null,
    })

    const lead = await facebookLeadAdsLeadService.findLatestByContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })

    expect(lead).toEqual({
      leadgenId: "lead-9",
      formId: "form-3",
      formName: null,
      adgroupId: null,
    })
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        contactId: "contact-1",
        automation: { workspaceId: "ws-1" },
      },
      orderBy: { createdAt: "desc" },
      columns: {
        leadgenId: true,
        formId: true,
        formName: true,
        adgroupId: true,
      },
    })
  })

  test("returns undefined when the contact has no lead", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      facebookLeadAdsLeadService.findLatestByContact({
        workspaceId: "ws-1",
        contactId: "contact-1",
      }),
    ).resolves.toBeUndefined()
  })
})
