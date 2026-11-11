// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
  isPlatformAdmin: vi.fn(),
  addListing: vi.fn(),
  createCategory: vi.fn(),
  searchCandidates: vi.fn(),
}))

class FakeChatbotXException extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

vi.mock("@chatbotx.io/business", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
  isPlatformAdmin: mocks.isPlatformAdmin,
  templateStoreService: {
    addListing: mocks.addListing,
    createCategory: mocks.createCategory,
    searchCandidates: mocks.searchCandidates,
  },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))
// The client is reduced to the handler it wraps, so the tests call the exact
// function the server action runs.
vi.mock("@/lib/safe-action", () => {
  const client = {
    inputSchema: () => ({ action: (handler: unknown) => handler }),
  }
  return { authActionClient: client }
})

const actions = (await import(
  "../src/features/template-store/template-store.action"
)) as unknown as Record<string, (arg: unknown) => Promise<unknown>>
const { addTemplateStoreListingSchema } = await import(
  "../src/features/template-store/schema"
)

const user = { id: "user-1" }
const run = (
  action: string,
  parsedInput: Record<string, unknown>,
): Promise<unknown> => actions[action]({ ctx: { user }, parsedInput })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSuperAdmin.mockResolvedValue(false)
  mocks.isPlatformAdmin.mockResolvedValue(false)
  mocks.addListing.mockResolvedValue(undefined)
  mocks.createCategory.mockResolvedValue(undefined)
  mocks.searchCandidates.mockResolvedValue([])
})

describe("platform scope", () => {
  test("a super admin who owns no tenant (cloud) can manage the platform store", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.isPlatformAdmin.mockResolvedValue(false)

    const outcome = await run("addTemplateStoreListingAction", {
      scope: "platform",
      templateId: "5",
      categoryIds: [],
    })

    expect(outcome).toEqual({ status: "done" })
    expect(mocks.addListing).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "root" },
        actorUserId: "user-1",
      }),
    )
  })

  test("a reseller who is not a super admin is refused, and nothing is written", async () => {
    mocks.isPlatformAdmin.mockResolvedValue(true)

    await expect(
      run("createTemplateStoreCategoryAction", {
        scope: "platform",
        name: "Flows",
      }),
    ).rejects.toThrow("Unauthorized")
    expect(mocks.createCategory).not.toHaveBeenCalled()
  })
})

describe("tenant scope", () => {
  test("scopes to the caller's own tenant, never to input", async () => {
    mocks.isPlatformAdmin.mockResolvedValue(true)

    await run("createTemplateStoreCategoryAction", {
      scope: "tenant",
      name: "Flows",
      tenantId: "999",
      ownerId: "someone-else",
    })

    expect(mocks.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "owner", ownerId: "user-1" } }),
    )
  })

  test("a user who is neither reseller nor admin is refused", async () => {
    await expect(
      run("addTemplateStoreListingAction", {
        scope: "tenant",
        templateId: "5",
        categoryIds: [],
      }),
    ).rejects.toThrow("Unauthorized")
    expect(mocks.addListing).not.toHaveBeenCalled()
  })

  test("a super admin does not get the tenant scope for free", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)

    await expect(
      run("searchTemplateStoreCandidatesAction", {
        scope: "tenant",
        keyword: "a",
      }),
    ).rejects.toThrow("Unauthorized")
    expect(mocks.searchCandidates).not.toHaveBeenCalled()
  })
})

describe("expected refusals become outcomes", () => {
  test("a business error code is returned as a typed rejection", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.addListing.mockRejectedValue(
      new FakeChatbotXException("exists", "templateStoreListingExists"),
    )

    await expect(
      run("addTemplateStoreListingAction", {
        scope: "platform",
        templateId: "5",
        categoryIds: [],
      }),
    ).resolves.toEqual({ status: "rejected", reason: "listingExists" })
  })

  test("an unknown error still throws", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.addListing.mockRejectedValue(new Error("db down"))

    await expect(
      run("addTemplateStoreListingAction", {
        scope: "platform",
        templateId: "5",
        categoryIds: [],
      }),
    ).rejects.toThrow("db down")
  })
})

describe("input schema", () => {
  test("accepts no category, rejects non-numeric ids and an unknown scope", () => {
    const base = { scope: "platform", templateId: "5", categoryIds: [] }
    expect(addTemplateStoreListingSchema.safeParse(base).success).toBe(true)
    expect(
      addTemplateStoreListingSchema.safeParse({ ...base, templateId: "abc" })
        .success,
    ).toBe(false)
    expect(
      addTemplateStoreListingSchema.safeParse({
        ...base,
        categoryIds: ["x"],
      }).success,
    ).toBe(false)
    expect(
      addTemplateStoreListingSchema.safeParse({ ...base, scope: "other" })
        .success,
    ).toBe(false)
  })
})
