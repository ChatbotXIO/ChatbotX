import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertReferencable: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertReferencable: mocks.assertReferencable,
}))
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: (fn: (tx: unknown) => unknown) => fn({}),
}))
vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  discountCodeRepository: {
    create: mocks.create,
    update: mocks.update,
    find: mocks.findFirst,
  },
}))

const { contactFilterParentsOf } = await import(
  "../src/template/uninstall-references"
)
const { discountCodeService } = await import("../src/discount-code/service")

const filter = {
  operator: "and",
  conditions: [
    { field: "subscribedToDripCampaign", operator: "in", value: ["77"] },
    { field: "keywordsReceived", operator: "in", value: ["88", "89"] },
    { field: "entryPointsLinks", operator: "eq", value: "90" },
    { field: "executedFlow", operator: "eq", value: "91" },
    { field: "tags", operator: "in", value: ["99"] },
    { field: "country", operator: "eq", value: "12345" },
  ],
}

describe("contactFilterParentsOf (shared with the uninstall probe)", () => {
  test("names every copied parent an id-valued field points at", () => {
    expect(contactFilterParentsOf(filter)).toEqual(
      expect.arrayContaining([
        { kind: "sequence", resourceId: "77" },
        { kind: "automatedResponse", resourceId: "88" },
        { kind: "automatedResponse", resourceId: "89" },
        { kind: "reflink", resourceId: "90" },
        { kind: "flow", resourceId: "91" },
      ]),
    )
  })

  test("ignores kinds an uninstall never deletes and plain-valued fields", () => {
    const parents = contactFilterParentsOf(filter)
    expect(parents).toHaveLength(5)
    expect(parents.some((parent) => parent.resourceId === "99")).toBe(false)
    expect(parents.some((parent) => parent.resourceId === "12345")).toBe(false)
  })

  test("a null or malformed filter has no parents", () => {
    expect(contactFilterParentsOf(null)).toEqual([])
    expect(contactFilterParentsOf({ conditions: "x" })).toEqual([])
    expect(contactFilterParentsOf({ conditions: [null, 3] })).toEqual([])
  })
})

describe("discount code writers guard the customer filter's references", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(
      discountCodeService as unknown as { assertValid: () => Promise<void> },
      "assertValid",
    ).mockResolvedValue(undefined)
  })

  const base = {
    workspaceId: "w1",
    code: "SAVE",
    kind: "percent",
    value: 10,
    appliesTo: "all",
    productIds: [],
    eligibility: "specificCustomers",
    customerFilter: filter,
  }

  test("create takes the guard for the filter's parents in the same transaction", async () => {
    mocks.create.mockResolvedValue({ id: "d1" })

    await discountCodeService.create(base as never)

    const call = mocks.assertReferencable.mock.calls[0][0]
    expect(call.workspaceId).toBe("w1")
    expect(call.parents).toContainEqual({
      kind: "sequence",
      resourceId: "77",
    })
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.assertReferencable.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0],
    )
  })

  test("update guards the merged filter's parents before writing", async () => {
    mocks.findFirst.mockResolvedValue({
      ...base,
      usedCount: 0,
      eligibility: "specificCustomers",
      customerFilter: null,
    })
    mocks.update.mockResolvedValue({ id: "d1" })

    await discountCodeService.update({
      workspaceId: "w1",
      discountCodeId: "d1",
      data: { customerFilter: filter } as never,
    })

    const call = mocks.assertReferencable.mock.calls[0][0]
    expect(call.parents).toContainEqual({ kind: "flow", resourceId: "91" })
    expect(mocks.assertReferencable.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0],
    )
  })

  test("a failing guard stops the write", async () => {
    mocks.assertReferencable.mockRejectedValueOnce(new Error("in progress"))

    await expect(discountCodeService.create(base as never)).rejects.toThrow(
      "in progress",
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
