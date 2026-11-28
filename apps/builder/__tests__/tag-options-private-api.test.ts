import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: { input: unknown; context: unknown }) => Promise<unknown>

const { authorizedAPI, handlersByPath } = vi.hoisted(() => {
  const handlersByPath: Record<string, Handler> = {}
  const makeProcedure = () => {
    let currentPath: string | undefined
    const procedure = {
      route: (config: { path: string }) => {
        currentPath = config.path
        return procedure
      },
      input: () => procedure,
      use: () => procedure,
      output: () => procedure,
      handler: (handler: Handler) => {
        if (currentPath) {
          handlersByPath[currentPath] = handler
        }
        return { handler }
      },
    }
    return procedure
  }
  return {
    authorizedAPI: {
      route: (config: { path: string }) => makeProcedure().route(config),
    },
    handlersByPath,
  }
})

const mocks = vi.hoisted(() => ({
  listOptions: vi.fn(),
  listAppliedTagIds: vi.fn(),
  requireContactAccessForMember: vi.fn(),
}))

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    listOptions: mocks.listOptions,
    listAppliedTagIds: mocks.listAppliedTagIds,
  },
}))
vi.mock("@/features/contacts/permissions", () => ({
  requireContactAccessForMember: mocks.requireContactAccessForMember,
}))
vi.mock("@/features/tags/queries", () => ({ listTags: vi.fn() }))

await import("@/features/tags/api/private")
const {
  APPLIED_TAG_IDS_MAX,
  listAppliedTagIdsRequest,
  listTagOptionsRequest,
  TAG_OPTIONS_MAX_PER_PAGE,
} = await import("@/features/tags/schema/query")

const PATH = "/workspaces/{workspaceId}/tag-options"
const context = {
  user: { id: "u1" },
  workspaceMember: { permissions: { contacts: "assigned" } },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("privateListWorkspaceTagOptionsAPI", () => {
  test("reads one page of options through the service", async () => {
    const page = {
      data: [{ id: "t-1", name: "alpha", color: null }],
      pageCount: 1,
    }
    mocks.listOptions.mockResolvedValue(page)
    const input = { workspaceId: "1", name: "al", page: 1, perPage: 50 }

    expect(await handlersByPath[PATH]?.({ input, context })).toEqual(page)
    expect(mocks.listOptions).toHaveBeenCalledWith(input)
    expect(mocks.requireContactAccessForMember).not.toHaveBeenCalled()
  })

  test("with a contact it checks the member can reach it, then reads applied options", async () => {
    mocks.listOptions.mockResolvedValue({ data: [], pageCount: 0 })
    const input = {
      workspaceId: "1",
      page: 1,
      perPage: 50,
      contactId: "9",
    }

    await handlersByPath[PATH]?.({ input, context })

    expect(mocks.requireContactAccessForMember).toHaveBeenCalledWith({
      permissions: context.workspaceMember.permissions,
      userId: "u1",
      workspaceId: "1",
      contactId: "9",
    })
    expect(mocks.listOptions).toHaveBeenCalledWith(input)
  })

  test("a contact outside the member's scope or workspace is not found and nothing is read", async () => {
    mocks.requireContactAccessForMember.mockRejectedValue(
      new Error("Contact not found"),
    )

    await expect(
      handlersByPath[PATH]?.({
        input: { workspaceId: "1", page: 1, perPage: 50, contactId: "9" },
        context,
      }),
    ).rejects.toThrow("Contact not found")
    expect(mocks.listOptions).not.toHaveBeenCalled()
  })
})

describe("privateListAppliedTagIdsAPI", () => {
  const APPLIED_PATH =
    "/workspaces/{workspaceId}/contacts/{contactId}/applied-tag-ids"
  const input = { workspaceId: "1", contactId: "9", tagIds: ["5", "6"] }

  test("checks the contact access, then returns the applied subset", async () => {
    mocks.requireContactAccessForMember.mockResolvedValue(undefined)
    mocks.listAppliedTagIds.mockResolvedValue(["5"])

    expect(await handlersByPath[APPLIED_PATH]?.({ input, context })).toEqual({
      appliedTagIds: ["5"],
    })
    expect(mocks.requireContactAccessForMember).toHaveBeenCalledWith({
      permissions: context.workspaceMember.permissions,
      userId: "u1",
      workspaceId: "1",
      contactId: "9",
    })
    expect(mocks.listAppliedTagIds).toHaveBeenCalledWith(input)
  })

  test("a contact outside the member's scope is not found and nothing is read", async () => {
    mocks.requireContactAccessForMember.mockRejectedValue(
      new Error("Contact not found"),
    )

    await expect(
      handlersByPath[APPLIED_PATH]?.({ input, context }),
    ).rejects.toThrow("Contact not found")
    expect(mocks.listAppliedTagIds).not.toHaveBeenCalled()
  })

  test("the request caps the tag ids", () => {
    expect(
      listAppliedTagIdsRequest.safeParse({
        ...input,
        tagIds: Array.from({ length: APPLIED_TAG_IDS_MAX + 1 }, (_, i) =>
          String(i + 1),
        ),
      }).success,
    ).toBe(false)
  })
})

describe("listTagOptionsRequest", () => {
  test("defaults the page and page size", () => {
    expect(listTagOptionsRequest.parse({ workspaceId: "1" })).toMatchObject({
      page: 1,
      perPage: TAG_OPTIONS_MAX_PER_PAGE,
    })
  })

  test("rejects a page size above the maximum", () => {
    expect(
      listTagOptionsRequest.safeParse({
        workspaceId: "1",
        perPage: TAG_OPTIONS_MAX_PER_PAGE + 1,
      }).success,
    ).toBe(false)
  })
})
