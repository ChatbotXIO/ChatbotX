import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertReferencable: vi.fn(async () => undefined),
  findByCode: vi.fn(),
  lock: vi.fn(),
  listAutoApply: vi.fn(),
  listOffered: vi.fn(),
  countRedemptions: vi.fn(),
  incrementUsed: vi.fn(),
  insertRedemption: vi.fn(),
  deleteRedemptionByOrder: vi.fn(),
  decrementUsed: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  findCategory: vi.fn(),
  findProducts: vi.fn(),
  matchesContactFilter: vi.fn(),
}))

// The template guards are covered by their own suites; here they only must not
// block the write, and run it on this file's mocked client.
vi.mock(
  "../../template/installed-resource.service",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../template/installed-resource.service")
    >()),
    assertReferencable: mocks.assertReferencable,
  }),
)

vi.mock("../../template/template-resource-locks", async (importOriginal) => {
  const { db } = await import("@chatbotx.io/database/client")
  return {
    ...(await importOriginal<
      typeof import("../../template/template-resource-locks")
    >()),
    withTemplateLockedTransaction: (run: (tx: unknown) => unknown) =>
      "transaction" in db
        ? (db as { transaction: (fn: typeof run) => unknown }).transaction(run)
        : run(db),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  isUniqueViolationError: (error: unknown) =>
    (error as { code?: string })?.code === "23505",
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  discountCodeRepository: {
    findByCode: (...args: unknown[]) => mocks.findByCode(...args),
    lock: (...args: unknown[]) => mocks.lock(...args),
    listAutoApply: (...args: unknown[]) => mocks.listAutoApply(...args),
    listOffered: (...args: unknown[]) => mocks.listOffered(...args),
    countRedemptions: (...args: unknown[]) => mocks.countRedemptions(...args),
    incrementUsed: (...args: unknown[]) => mocks.incrementUsed(...args),
    insertRedemption: (...args: unknown[]) => mocks.insertRedemption(...args),
    deleteRedemptionByOrder: (...args: unknown[]) =>
      mocks.deleteRedemptionByOrder(...args),
    decrementUsed: (...args: unknown[]) => mocks.decrementUsed(...args),
    create: (...args: unknown[]) => mocks.create(...args),
    find: (...args: unknown[]) => mocks.find(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
  productCategoryRepository: {
    find: (...args: unknown[]) => mocks.findCategory(...args),
  },
  productRepository: {
    findForOrder: (...args: unknown[]) => mocks.findProducts(...args),
  },
}))

vi.mock("../../contact/service", () => ({
  contactService: {
    matchesContactFilter: (...args: unknown[]) =>
      mocks.matchesContactFilter(...args),
  },
}))

const { discountCodeService } = await import("../service")

const GENERATED_CODE = /^[A-HJ-NP-Za-km-z2-9]{8}$/

const code = (overrides: Record<string, unknown> = {}) => ({
  id: "dc1",
  workspaceId: "ws1",
  code: "CODE20",
  autoApply: false,
  discountType: "percentage",
  discountValue: 20,
  appliesTo: "entireOrder",
  categoryId: null,
  productIds: [],
  minimumType: "none",
  minimumValue: 0,
  usageLimit: null,
  usedCount: 0,
  oncePerCustomer: false,
  eligibility: "everyone",
  customerFilter: null,
  startsAt: new Date("2026-01-01T00:00:00Z"),
  endsAt: null,
  isActive: true,
  ...overrides,
})

const order = {
  workspaceId: "ws1",
  contactId: "c1",
  lines: [{ productId: "p1", categoryIds: [], amount: 50, quantity: 2 }],
  shippingType: "delivery" as const,
  shippingTotal: 5,
  currency: "USD",
}

const tx = { name: "tx" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.countRedemptions.mockResolvedValue(0)
  mocks.listAutoApply.mockResolvedValue([])
  mocks.listOffered.mockResolvedValue([])
})

describe("discountCodeService.resolve", () => {
  test("prices the typed code, found without regard to case", async () => {
    mocks.findByCode.mockResolvedValue(code())
    await expect(
      discountCodeService.resolve({ ...order, code: " code20 " }),
    ).resolves.toMatchObject({ amount: 10, discountCode: { id: "dc1" } })
    expect(mocks.findByCode).toHaveBeenCalledWith(
      { workspaceId: "ws1", code: "code20" },
      undefined,
    )
  })

  test("an unknown typed code is refused", async () => {
    mocks.findByCode.mockResolvedValue(undefined)
    await expect(
      discountCodeService.resolve({ ...order, code: "NOPE" }),
    ).rejects.toMatchObject({ code: "discountCodeNotFound" })
  })

  test("inside an order the code is locked and read again", async () => {
    mocks.findByCode.mockResolvedValue(code())
    mocks.lock.mockResolvedValue(code({ usageLimit: 1, usedCount: 1 }))
    await expect(
      discountCodeService.resolve({
        ...order,
        code: "CODE20",
        tx: tx as never,
      }),
    ).rejects.toMatchObject({ code: "discountCodeUsageLimitReached" })
    expect(mocks.lock).toHaveBeenCalledWith(
      { workspaceId: "ws1", discountCodeId: "dc1" },
      tx,
    )
  })

  test("picks the automatic code that takes off the most", async () => {
    mocks.listAutoApply.mockResolvedValue([
      code({ id: "small", code: "SMALL", autoApply: true, discountValue: 10 }),
      code({
        id: "fixed",
        code: "FIXED",
        autoApply: true,
        discountType: "fixedAmount",
        discountValue: 15,
      }),
      code({
        id: "big-minimum",
        code: "BIG",
        autoApply: true,
        discountValue: 50,
        minimumType: "amount",
        minimumValue: 100,
      }),
    ])
    await expect(
      discountCodeService.resolve({ ...order, autoApply: true }),
    ).resolves.toMatchObject({ amount: 15, discountCode: { id: "fixed" } })
  })

  test("no automatic code without autoApply", async () => {
    await expect(discountCodeService.resolve(order)).resolves.toBeNull()
    expect(mocks.listAutoApply).not.toHaveBeenCalled()
  })

  test("a code for specific customers checks the contact filter", async () => {
    mocks.findByCode.mockResolvedValue(
      code({
        eligibility: "specificCustomers",
        customerFilter: { operator: "and", conditions: [{ field: "tags" }] },
      }),
    )
    mocks.matchesContactFilter.mockResolvedValue(false)
    await expect(
      discountCodeService.resolve({ ...order, code: "CODE20" }),
    ).rejects.toMatchObject({ code: "discountCodeNotEligible" })
    expect(mocks.matchesContactFilter).toHaveBeenCalledWith({
      workspaceId: "ws1",
      contactId: "c1",
      contactFilter: { operator: "and", conditions: [{ field: "tags" }] },
    })
  })

  test("a code for specific customers is not for an order without a contact", async () => {
    mocks.findByCode.mockResolvedValue(
      code({
        eligibility: "specificCustomers",
        customerFilter: { operator: "and", conditions: [{ field: "tags" }] },
      }),
    )
    await expect(
      discountCodeService.resolve({
        ...order,
        contactId: null,
        code: "CODE20",
      }),
    ).rejects.toMatchObject({ code: "discountCodeNotEligible" })
  })

  test("one use per customer", async () => {
    mocks.findByCode.mockResolvedValue(code({ oncePerCustomer: true }))
    mocks.countRedemptions.mockResolvedValue(1)
    await expect(
      discountCodeService.resolve({ ...order, code: "CODE20" }),
    ).rejects.toMatchObject({ code: "discountCodeAlreadyUsed" })
  })
})

describe("discountCodeService.listAvailable", () => {
  test("offers the codes this order can use, most taken off first, then soonest to end", async () => {
    mocks.listOffered.mockResolvedValue([
      code({ id: "small", code: "SMALL", discountValue: 10 }),
      code({
        id: "ship",
        code: "SHIP",
        discountType: "freeShipping",
        discountValue: 0,
        // Ties with SMALL; ending sooner puts it first.
        endsAt: new Date("2026-02-01T00:00:00Z"),
      }),
      code({
        id: "fixed",
        code: "FIXED",
        discountType: "fixedAmount",
        discountValue: 15,
      }),
    ])
    await expect(
      discountCodeService.listAvailable({
        ...order,
        now: new Date("2026-01-15T00:00:00Z"),
      }),
    ).resolves.toEqual([
      {
        code: "FIXED",
        discountType: "fixedAmount",
        discountValue: 15,
        amount: 15,
        endsAt: null,
        status: "available",
      },
      {
        code: "SHIP",
        discountType: "freeShipping",
        discountValue: 0,
        amount: 5,
        endsAt: new Date("2026-02-01T00:00:00Z"),
        status: "available",
      },
      {
        code: "SMALL",
        discountType: "percentage",
        discountValue: 10,
        amount: 5,
        endsAt: null,
        status: "available",
      },
    ])
    expect(mocks.listOffered).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws1", limit: 20 }),
    )
  })

  test("leaves out a code that does not fit the order or takes nothing off", async () => {
    mocks.listOffered.mockResolvedValue([
      code({
        id: "minimum",
        code: "MIN",
        minimumType: "amount",
        minimumValue: 500,
      }),
      code({
        id: "pickup",
        code: "SHIP",
        discountType: "freeShipping",
        discountValue: 0,
      }),
    ])
    await expect(
      discountCodeService.listAvailable({
        ...order,
        shippingType: "pickup",
        shippingTotal: 0,
      }),
    ).resolves.toEqual([])
  })

  test("keeps ended and used-up codes, greyed out after the usable ones", async () => {
    mocks.listOffered.mockResolvedValue([
      code({
        id: "ended",
        code: "ENDED",
        endsAt: new Date("2026-01-10T00:00:00Z"),
      }),
      code({ id: "full", code: "FULL", usageLimit: 5, usedCount: 5 }),
      code({ id: "mine", code: "MINE", oncePerCustomer: true }),
      code({ id: "ok", code: "OK", discountValue: 10 }),
    ])
    mocks.countRedemptions.mockResolvedValue(1)
    const listed = await discountCodeService.listAvailable({
      ...order,
      now: new Date("2026-01-15T00:00:00Z"),
    })
    expect(
      listed.map(({ code, status, amount }) => [code, status, amount]),
    ).toEqual([
      ["OK", "available", 5],
      ["FULL", "usedUp", 0],
      ["MINE", "usedUp", 0],
      ["ENDED", "expired", 0],
    ])
  })
})

describe("discountCodeService.listAvailable — customer filter", () => {
  const filtered = code({
    id: "vip",
    code: "VIP",
    eligibility: "specificCustomers",
    customerFilter: { operator: "and", conditions: [{ field: "tag" }] },
  })

  test("a code for other customers stays, marked not eligible", async () => {
    mocks.listOffered.mockResolvedValue([filtered])
    mocks.matchesContactFilter.mockResolvedValue(false)
    await expect(discountCodeService.listAvailable(order)).resolves.toEqual([
      expect.objectContaining({
        code: "VIP",
        status: "notEligible",
        amount: 0,
      }),
    ])
  })

  test("a code whose filter the customer matches can be used", async () => {
    mocks.listOffered.mockResolvedValue([filtered])
    mocks.matchesContactFilter.mockResolvedValue(true)
    await expect(discountCodeService.listAvailable(order)).resolves.toEqual([
      expect.objectContaining({ code: "VIP", status: "available", amount: 10 }),
    ])
  })
})

describe("discountCodeService.redeem / release", () => {
  const applied = { discountCode: code() as never, amount: 10 }

  test("counts the use and records it for the order", async () => {
    mocks.incrementUsed.mockResolvedValue({ id: "dc1" })
    await discountCodeService.redeem(
      { workspaceId: "ws1", orderId: "o1", contactId: "c1", applied },
      tx as never,
    )
    expect(mocks.insertRedemption).toHaveBeenCalledWith(
      {
        workspaceId: "ws1",
        discountCodeId: "dc1",
        orderId: "o1",
        contactId: "c1",
        amount: 10,
      },
      tx,
    )
  })

  test("refuses when the last use went to another order meanwhile", async () => {
    mocks.incrementUsed.mockResolvedValue(undefined)
    await expect(
      discountCodeService.redeem(
        { workspaceId: "ws1", orderId: "o1", contactId: "c1", applied },
        tx as never,
      ),
    ).rejects.toMatchObject({ code: "discountCodeUsageLimitReached" })
    expect(mocks.insertRedemption).not.toHaveBeenCalled()
  })

  test("release gives the use back only when the order used a code", async () => {
    mocks.deleteRedemptionByOrder.mockResolvedValueOnce({
      discountCodeId: "dc1",
    })
    await discountCodeService.release(
      { workspaceId: "ws1", orderId: "o1" },
      tx as never,
    )
    expect(mocks.decrementUsed).toHaveBeenCalledWith("dc1", tx)

    mocks.deleteRedemptionByOrder.mockResolvedValueOnce(undefined)
    await discountCodeService.release(
      { workspaceId: "ws1", orderId: "o2" },
      tx as never,
    )
    expect(mocks.decrementUsed).toHaveBeenCalledTimes(1)
  })
})

describe("discountCodeService.create", () => {
  const input = {
    workspaceId: "ws1",
    code: "SUMMER",
    autoApply: false,
    discountType: "percentage" as const,
    discountValue: 20,
    appliesTo: "entireOrder" as const,
    categoryId: "cat1",
    productIds: ["p1"],
    minimumType: "none" as const,
    minimumValue: 50,
    usageLimit: null,
    oncePerCustomer: false,
    eligibility: "everyone" as const,
    customerFilter: { operator: "and" as const, conditions: [{}] },
    startsAt: new Date("2026-10-01T00:00:00Z"),
    endsAt: null,
    isActive: true,
  }

  test("stores only what the choices use", async () => {
    mocks.create.mockResolvedValue({ id: "dc1" })
    await discountCodeService.create(input)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: null,
        productIds: [],
        minimumValue: 0,
        customerFilter: null,
      }),
      expect.anything(),
    )
  })

  test("free shipping has no value and applies to the whole order", async () => {
    mocks.create.mockResolvedValue({ id: "dc1" })
    await discountCodeService.create({
      ...input,
      discountType: "freeShipping",
      appliesTo: "products",
    })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ discountValue: 0, appliesTo: "entireOrder" }),
      expect.anything(),
    )
  })

  test.each([
    [{ code: "a b" }, "code"],
    [{ discountValue: 120 }, "discountValue"],
    [
      { discountType: "fixedAmount" as const, discountValue: 0 },
      "discountValue",
    ],
    [{ minimumType: "quantity" as const, minimumValue: 1.5 }, "minimumValue"],
    [{ usageLimit: 0 }, "usageLimit"],
    [
      { eligibility: "specificCustomers" as const, customerFilter: null },
      "customerFilter",
    ],
    [{ endsAt: new Date("2026-09-01T00:00:00Z") }, "endsAt"],
  ])("refuses %o", async (overrides, field) => {
    await expect(
      discountCodeService.create({ ...input, ...overrides }),
    ).rejects.toMatchObject({ code: "validation", field })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("a category of another workspace is refused", async () => {
    mocks.findCategory.mockResolvedValue(undefined)
    await expect(
      discountCodeService.create({ ...input, appliesTo: "category" }),
    ).rejects.toMatchObject({ code: "validation", field: "categoryId" })
  })

  test("a code already taken is a duplicate", async () => {
    mocks.create.mockRejectedValue({ code: "23505" })
    await expect(discountCodeService.create(input)).rejects.toMatchObject({
      code: "discountCodeDuplicated",
    })
  })
})

describe("discountCodeService.update after deletions", () => {
  test("drops deleted products when the patch sends no product list", async () => {
    mocks.find.mockResolvedValue(
      code({ appliesTo: "products", productIds: ["p1", "gone"] }),
    )
    mocks.findProducts.mockResolvedValue([{ id: "p1" }])
    mocks.update.mockResolvedValue({ id: "dc1" })

    await discountCodeService.update({
      workspaceId: "ws1",
      discountCodeId: "dc1",
      data: { usageLimit: 5 },
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ productIds: ["p1"] }),
      }),
      expect.anything(),
    )
  })

  test("still asks for products when none are left", async () => {
    mocks.find.mockResolvedValue(
      code({ appliesTo: "products", productIds: ["gone"], isActive: false }),
    )
    mocks.findProducts.mockResolvedValue([])

    await expect(
      discountCodeService.update({
        workspaceId: "ws1",
        discountCodeId: "dc1",
        data: { usageLimit: 5 },
      }),
    ).rejects.toMatchObject({ field: "productIds" })
  })

  test("saves a category code again once a new category is chosen", async () => {
    mocks.find.mockResolvedValue(
      code({ appliesTo: "category", categoryId: null, isActive: false }),
    )
    mocks.findCategory.mockResolvedValue({ id: "cat2" })
    mocks.update.mockResolvedValue({ id: "dc1" })

    await discountCodeService.update({
      workspaceId: "ws1",
      discountCodeId: "dc1",
      data: { categoryId: "cat2", isActive: true },
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ categoryId: "cat2", isActive: true }),
      }),
      expect.anything(),
    )
  })

  test("refuses to switch on a category code whose category was deleted", async () => {
    mocks.find.mockResolvedValue(
      code({ appliesTo: "category", categoryId: null, isActive: false }),
    )

    await expect(
      discountCodeService.setActive({
        workspaceId: "ws1",
        discountCodeId: "dc1",
        isActive: true,
      }),
    ).rejects.toMatchObject({ field: "categoryId" })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("switches a code off without checking what it applies to", async () => {
    mocks.update.mockResolvedValue({ id: "dc1" })

    await discountCodeService.setActive({
      workspaceId: "ws1",
      discountCodeId: "dc1",
      isActive: false,
    })

    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalled()
  })
})

describe("discountCodeService.generateCode", () => {
  test("8 characters without look-alikes, skipping codes already taken", async () => {
    mocks.findByCode
      .mockResolvedValueOnce({ id: "taken" })
      .mockResolvedValueOnce(undefined)
    const code = await discountCodeService.generateCode("ws1")
    expect(code).toMatch(GENERATED_CODE)
    expect(mocks.findByCode).toHaveBeenCalledTimes(2)
  })
})
