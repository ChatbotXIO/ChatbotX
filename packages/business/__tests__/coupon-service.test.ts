import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockTopic: vi.fn(),
  countTopicCoupons: vi.fn(),
  findExistingCodes: vi.fn(),
  insertCoupons: vi.fn(),
  markTopicHasCoupons: vi.fn(),
  findIssuedCoupon: vi.fn(),
  claimCoupon: vi.fn(),
  markUsed: vi.fn(),
  isTopicIssueable: vi.fn(),
  findTopic: vi.fn(),
  findTopicByName: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  getExportFile: vi.fn(),
  isUniqueViolationError: vi.fn(),
  selectWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mocks.selectWorkspace(),
        }),
      }),
    }),
  },
  eq: vi.fn(),
  isUniqueViolationError: (...args: unknown[]) =>
    mocks.isUniqueViolationError(...args),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  couponTopicStatuses: { enum: { active: "active", archived: "archived" } },
  fileStatuses: {
    enum: { uploaded: "uploaded" },
    parse: (value: unknown) => value,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  couponRepository: {
    lockTopic: (...args: unknown[]) => mocks.lockTopic(...args),
    countTopicCoupons: (...args: unknown[]) => mocks.countTopicCoupons(...args),
    findExistingCodes: (...args: unknown[]) => mocks.findExistingCodes(...args),
    insertCoupons: (...args: unknown[]) => mocks.insertCoupons(...args),
    markTopicHasCoupons: (...args: unknown[]) =>
      mocks.markTopicHasCoupons(...args),
    findIssuedCoupon: (...args: unknown[]) => mocks.findIssuedCoupon(...args),
    claimCoupon: (...args: unknown[]) => mocks.claimCoupon(...args),
    markUsed: (...args: unknown[]) => mocks.markUsed(...args),
    isTopicIssueable: (...args: unknown[]) => mocks.isTopicIssueable(...args),
    findTopic: (...args: unknown[]) => mocks.findTopic(...args),
    findTopicByName: (...args: unknown[]) => mocks.findTopicByName(...args),
    createTopic: (...args: unknown[]) => mocks.createTopic(...args),
    updateTopic: (...args: unknown[]) => mocks.updateTopic(...args),
    getExportFile: (...args: unknown[]) => mocks.getExportFile(...args),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { couponService } = await import("../src/coupon/service")

describe("couponService.importBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.lockTopic.mockResolvedValue({ id: "topic-2", status: "active" })
    mocks.countTopicCoupons.mockResolvedValue(0)
    mocks.findExistingCodes.mockResolvedValue(new Set(["SHARED"]))
    mocks.insertCoupons.mockResolvedValue([{ id: "coupon-1", code: "NEW" }])
    mocks.markTopicHasCoupons.mockResolvedValue(undefined)
  })

  test("dedupes imported coupon codes across the workspace", async () => {
    await expect(
      couponService.importBatch({
        workspaceId: "workspace-1",
        topicId: "topic-2",
        codes: [" SHARED ", "NEW", "SHARED"],
      }),
    ).resolves.toEqual({
      processed: 2,
      created: 1,
      existing: 1,
      allowedRemaining: 10_000,
      currentCount: 0,
    })

    expect(mocks.findExistingCodes).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", codes: ["SHARED", "NEW"] },
      "tx",
    )
    expect(mocks.insertCoupons).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", topicId: "topic-2", codes: ["NEW"] },
      "tx",
    )
  })
})

describe("couponService.issueCoupon", () => {
  const input = {
    workspaceId: "workspace-1",
    topicId: "topic-1",
    contactId: "contact-1",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
  })

  test("returns topicUnavailable without opening a transaction when the topic isn't issueable", async () => {
    mocks.isTopicIssueable.mockResolvedValue(undefined)

    await expect(couponService.issueCoupon(input)).resolves.toEqual({
      ok: false,
      reason: "topicUnavailable",
      coupon: null,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("returns the existing coupon without claiming a new one", async () => {
    mocks.isTopicIssueable.mockResolvedValue({ id: "topic-1" })
    mocks.findIssuedCoupon.mockResolvedValue({ id: "coupon-1", code: "AAA" })

    await expect(couponService.issueCoupon(input)).resolves.toEqual({
      ok: true,
      reason: "existing",
      coupon: { id: "coupon-1", code: "AAA" },
    })
    expect(mocks.claimCoupon).not.toHaveBeenCalled()
  })

  test("claims a new coupon when the contact has none yet", async () => {
    mocks.isTopicIssueable.mockResolvedValue({ id: "topic-1" })
    mocks.findIssuedCoupon.mockResolvedValue(undefined)
    mocks.claimCoupon.mockResolvedValue({ id: "coupon-2", code: "BBB" })

    await expect(couponService.issueCoupon(input)).resolves.toEqual({
      ok: true,
      reason: "issued",
      coupon: { id: "coupon-2", code: "BBB" },
    })
  })

  test("returns noAvailableCoupon when the topic has no unclaimed coupon left", async () => {
    mocks.isTopicIssueable.mockResolvedValue({ id: "topic-1" })
    mocks.findIssuedCoupon.mockResolvedValue(undefined)
    mocks.claimCoupon.mockResolvedValue(undefined)

    await expect(couponService.issueCoupon(input)).resolves.toEqual({
      ok: false,
      reason: "noAvailableCoupon",
      coupon: null,
    })
  })

  test("falls back to the winning coupon when two concurrent claims race on the unique index", async () => {
    mocks.isTopicIssueable.mockResolvedValue({ id: "topic-1" })
    mocks.transaction.mockImplementation(() => {
      throw new Error("duplicate key value violates unique constraint")
    })
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.findIssuedCoupon.mockResolvedValue({ id: "coupon-3", code: "CCC" })

    await expect(couponService.issueCoupon(input)).resolves.toEqual({
      ok: true,
      reason: "existing",
      coupon: { id: "coupon-3", code: "CCC" },
    })
  })
})

describe("couponService.markCouponUsed", () => {
  const input = {
    workspaceId: "workspace-1",
    topicId: "topic-1",
    contactId: "contact-1",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns noIssuedCoupon when the contact has no coupon for this topic", async () => {
    mocks.findIssuedCoupon.mockResolvedValue(undefined)

    await expect(couponService.markCouponUsed(input)).resolves.toEqual({
      ok: false,
      reason: "noIssuedCoupon",
      coupon: null,
    })
    expect(mocks.markUsed).not.toHaveBeenCalled()
  })

  test("returns alreadyUsed without writing when the coupon was already marked used", async () => {
    const existing = { id: "coupon-1", usedAt: new Date("2024-01-01") }
    mocks.findIssuedCoupon.mockResolvedValue(existing)

    await expect(couponService.markCouponUsed(input)).resolves.toEqual({
      ok: true,
      reason: "alreadyUsed",
      coupon: existing,
    })
    expect(mocks.markUsed).not.toHaveBeenCalled()
  })

  test("marks the coupon used on the happy path", async () => {
    mocks.findIssuedCoupon.mockResolvedValue({ id: "coupon-1", usedAt: null })
    const marked = { id: "coupon-1", usedAt: new Date("2024-02-02") }
    mocks.markUsed.mockResolvedValue(marked)

    await expect(couponService.markCouponUsed(input)).resolves.toEqual({
      ok: true,
      reason: "markedUsed",
      coupon: marked,
    })
  })

  test("re-fetches and returns alreadyUsed when a concurrent request wins the mark-used race", async () => {
    const staleExisting = { id: "coupon-1", usedAt: null }
    const winnerCoupon = { id: "coupon-1", usedAt: new Date("2024-03-03") }
    mocks.findIssuedCoupon
      .mockResolvedValueOnce(staleExisting)
      .mockResolvedValueOnce(winnerCoupon)
    mocks.markUsed.mockResolvedValue(undefined)

    await expect(couponService.markCouponUsed(input)).resolves.toEqual({
      ok: true,
      reason: "alreadyUsed",
      coupon: winnerCoupon,
    })
    expect(mocks.findIssuedCoupon).toHaveBeenCalledTimes(2)
  })
})

describe("couponService topic validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectWorkspace.mockResolvedValue([{ timezone: "UTC" }])
  })

  test("createTopic rejects an empty name", async () => {
    await expect(
      couponService.createTopic({ workspaceId: "workspace-1", name: "   " }),
    ).rejects.toMatchObject({ code: "couponTopicNameRequired" })
  })

  test("createTopic rejects a name over 255 characters", async () => {
    await expect(
      couponService.createTopic({
        workspaceId: "workspace-1",
        name: "a".repeat(256),
      }),
    ).rejects.toMatchObject({ code: "couponTopicNameTooLong" })
  })

  test("createTopic rejects a description over 1000 characters", async () => {
    await expect(
      couponService.createTopic({
        workspaceId: "workspace-1",
        name: "Valid name",
        description: "a".repeat(1001),
      }),
    ).rejects.toMatchObject({ code: "couponTopicDescriptionTooLong" })
  })

  test("createTopic rejects a duplicate name in the same workspace regardless of case", async () => {
    mocks.findTopicByName.mockResolvedValue({ id: "existing-topic" })

    await expect(
      couponService.createTopic({
        workspaceId: "workspace-1",
        name: "DuPlIcAtE",
      }),
    ).rejects.toMatchObject({ code: "couponTopicNameDuplicated" })
  })

  test("createTopic rejects an expiresAt date in the past", async () => {
    mocks.findTopicByName.mockResolvedValue(undefined)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

    await expect(
      couponService.createTopic({
        workspaceId: "workspace-1",
        name: "Valid name",
        expiresAt: yesterday,
      }),
    ).rejects.toMatchObject({ code: "couponTopicValidityInPast" })
  })

  test("updateTopic ignores name/description changes once the topic has ever had a coupon, but still updates expiresAt", async () => {
    mocks.findTopic.mockResolvedValue({
      id: "topic-1",
      hasEverHadCoupon: true,
      name: "Old name",
      description: "Old description",
    })
    mocks.updateTopic.mockResolvedValue({ id: "topic-1", name: "Old name" })
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await couponService.updateTopic({
      workspaceId: "workspace-1",
      topicId: "topic-1",
      name: "New name",
      description: "New description",
      expiresAt: future,
    })

    expect(mocks.findTopicByName).not.toHaveBeenCalled()
    expect(mocks.updateTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        topicId: "topic-1",
        name: undefined,
        description: undefined,
        expiresAt: expect.any(Date),
      }),
    )
  })
})

describe("couponService.getExportFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("requires the export file to belong to the requesting user", async () => {
    mocks.getExportFile.mockResolvedValue(undefined)

    await expect(
      couponService.getExportFile({
        workspaceId: "workspace-1",
        fileId: "file-1",
        userId: "user-2",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.getExportFile).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      fileId: "file-1",
      userId: "user-2",
    })
  })
})
