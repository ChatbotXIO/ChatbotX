// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  clear: vi.fn(),
}))

class FakeChatbotXException extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

vi.mock("@chatbotx.io/business", () => ({
  tenantDefaultTemplateService: { set: mocks.set, clear: mocks.clear },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))
// The clients are reduced to the handler they wrap, so the tests call the
// exact function the server action runs.
const clientUsedBy = vi.hoisted(() => new Map<unknown, string>())
vi.mock("@/lib/safe-action", () => {
  const tagged = (client: string) => ({
    inputSchema: () => ({
      action: (handler: unknown) => {
        clientUsedBy.set(handler, client)
        return handler
      },
    }),
    action: (handler: unknown) => {
      clientUsedBy.set(handler, client)
      return handler
    },
  })
  return {
    platformAdminActionClient: tagged("platformAdmin"),
    superAdminActionClient: tagged("superAdmin"),
  }
})

const {
  updateDefaultTemplateAction,
  updateRootDefaultTemplateAction,
  clearDefaultTemplateAction,
  clearRootDefaultTemplateAction,
} = (await import(
  "../src/features/platform-default-template/update-default-template.action"
)) as unknown as Record<string, (arg: unknown) => Promise<unknown>>
const { updateDefaultTemplateSchema } = await import(
  "../src/features/platform-default-template/schema"
)

const input = { templateId: "55", templateKey: "key-value" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.set.mockResolvedValue(undefined)
})

describe("who may call each action", () => {
  test("reseller actions run on the reseller client, root actions on the super-admin client", () => {
    expect([
      clientUsedBy.get(updateDefaultTemplateAction),
      clientUsedBy.get(clearDefaultTemplateAction),
      clientUsedBy.get(updateRootDefaultTemplateAction),
      clientUsedBy.get(clearRootDefaultTemplateAction),
    ]).toEqual(["platformAdmin", "platformAdmin", "superAdmin", "superAdmin"])
  })
})

describe("default template actions", () => {
  test("the reseller action scopes to the caller, never to input", async () => {
    const outcome = await updateDefaultTemplateAction({
      ctx: { user: { id: "reseller-1" } },
      parsedInput: { ...input, tenantId: "999", ownerId: "someone-else" },
    })

    expect(outcome).toEqual({ status: "saved" })
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "owner", ownerId: "reseller-1" },
        actorUserId: "reseller-1",
      }),
    )
  })

  test("the root action uses the root scope", async () => {
    await updateRootDefaultTemplateAction({
      ctx: { user: { id: "admin-1" } },
      parsedInput: input,
    })

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "root" },
        actorUserId: "admin-1",
      }),
    )
  })

  test("clear actions use the matching scope", async () => {
    await clearDefaultTemplateAction({ ctx: { user: { id: "reseller-1" } } })
    await clearRootDefaultTemplateAction({ ctx: { user: { id: "admin-1" } } })

    expect(mocks.clear).toHaveBeenNthCalledWith(1, {
      scope: { kind: "owner", ownerId: "reseller-1" },
      actorUserId: "reseller-1",
    })
    expect(mocks.clear).toHaveBeenNthCalledWith(2, {
      scope: { kind: "root" },
      actorUserId: "admin-1",
    })
  })

  test.each([
    ["tenantDefaultTemplateUnavailable", "unavailable"],
    ["tenantDefaultTemplateShareDisabled", "shareDisabled"],
  ])("answers %s as a typed rejection, not a thrown message", async (code, reason) => {
    mocks.set.mockRejectedValue(new FakeChatbotXException("English text", code))

    expect(
      await updateRootDefaultTemplateAction({
        ctx: { user: { id: "admin-1" } },
        parsedInput: input,
      }),
    ).toEqual({ status: "rejected", reason })
  })

  test("lets every other failure reach the safe-action error path", async () => {
    mocks.set.mockRejectedValue(
      new FakeChatbotXException("boom", "systemError"),
    )
    await expect(
      updateRootDefaultTemplateAction({
        ctx: { user: { id: "admin-1" } },
        parsedInput: input,
      }),
    ).rejects.toThrow("boom")

    mocks.set.mockRejectedValue(new Error("db down"))
    await expect(
      updateRootDefaultTemplateAction({
        ctx: { user: { id: "admin-1" } },
        parsedInput: input,
      }),
    ).rejects.toThrow("db down")
  })
})

describe("updateDefaultTemplateSchema", () => {
  test("accepts a numeric id and a non-empty key, trimmed", () => {
    expect(
      updateDefaultTemplateSchema.parse({
        templateId: "55",
        templateKey: " k ",
      }),
    ).toEqual({ templateId: "55", templateKey: "k" })
  })

  test.each([
    [{ templateId: "abc", templateKey: "k" }],
    [{ templateId: "", templateKey: "k" }],
    [{ templateId: "55", templateKey: "   " }],
    [{ templateId: "55" }],
  ])("rejects %j", (value) => {
    expect(updateDefaultTemplateSchema.safeParse(value).success).toBe(false)
  })
})
