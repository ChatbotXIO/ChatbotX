import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedHandler = (args: {
  context: { workspace: { id: string; ownerId: string } }
  input: unknown
}) => Promise<unknown>

type CapturedProcedure = {
  route: RouteConfig
  handler?: CapturedHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: CapturedHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const invitationService = { create: vi.fn() }
const workspaceMemberService = {
  delete: vi.fn(),
  findByIdOrFail: vi.fn(),
  update: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  invitationService,
  workspaceMemberService,
}))

const listWorkspaceMembers = vi.fn()
const getWorkspaceMember = vi.fn()

vi.mock("@/features/workspace-members/queries", () => ({
  getWorkspaceMember,
  listWorkspaceMembers,
}))

vi.mock("@/features/workspace-members/schema/public", () => ({
  inviteWorkspaceMemberPublicRequest: z.object({}),
  removeWorkspaceMemberPublicRequest: z.object({}),
  updateWorkspaceMemberPublicRequest: z.object({}),
  workspaceInvitationPublicResource: z.object({}),
  workspaceMemberPublicResource: z.object({}),
}))

vi.mock("@/features/workspace-members/schema/query", () => ({
  getWorkspaceMemberRequest: z.object({ workspaceId: z.string() }),
  getWorkspaceMemberResponse: z.object({}),
  listWorkspaceMembersRequest: z.object({
    workspaceId: z.string(),
    page: z.number(),
    perPage: z.number(),
  }),
  listWorkspaceMembersResponse: z.object({}),
}))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnCreatingResource: {},
  possibleErrorsOnDeletingResource: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
  possibleErrorsOnMutatingResource: {},
}))

await import("@/features/workspace-members/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgsAtImport = workspaceTokenAuthAPIForScope.mock.calls.map(
  ([scope]) => scope,
)
const context = { workspace: { id: "workspace-1", ownerId: "owner-1" } }
const permissions = {
  superAdmin: false,
  analytics: true,
  flows: false,
  contacts: true,
  onlyAssignedContacts: false,
  emailAndPhone: false,
  broadcast: false,
  ecommerce: false,
}
const updateInput = {
  memberId: "member-1",
  permissions,
  notificationTypes: {
    notifyAdmin: true,
    newMessageToHuman: false,
    newOrder: false,
  },
  notificationChannels: {
    messenger: false,
    email: true,
    telegram: false,
    browser: true,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers list and get under inbox and writes under workspace", () => {
  expect(scopeArgsAtImport).toEqual(["inbox", "workspace"])
})

describe("GET /v1/members", () => {
  const procedure = findProcedure("GET", "/v1/members")

  test("lists members in the authenticated workspace", async () => {
    const result = { data: [{ id: "member-1" }], pageCount: 2 }
    listWorkspaceMembers.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 2, perPage: 25, keyword: "Ada" },
      }),
    ).resolves.toEqual(result)

    expect(listWorkspaceMembers).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
      keyword: "Ada",
    })
  })
})

describe("GET /v1/members/{memberId}", () => {
  const procedure = findProcedure("GET", "/v1/members/{memberId}")

  test("gets a member in the authenticated workspace", async () => {
    const member = { id: "member-1", user: { id: "user-1" } }
    getWorkspaceMember.mockResolvedValueOnce(member)

    await expect(
      procedure.handler?.({ context, input: { memberId: "member-1" } }),
    ).resolves.toEqual(member)

    expect(getWorkspaceMember).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      memberId: "member-1",
    })
  })

  test("rejects a missing member instead of returning an empty response", async () => {
    getWorkspaceMember.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { memberId: "missing" } }),
    ).rejects.toThrow("Member not found")
  })
})

describe("POST /v1/members/invitations", () => {
  const procedure = findProcedure("POST", "/v1/members/invitations")

  test("creates an invitation attributed to the workspace owner", async () => {
    const invitation = { id: "invitation-1", code: "invite-code" }
    invitationService.create.mockResolvedValueOnce(invitation)

    await expect(
      procedure.handler?.({ context, input: { permissions } }),
    ).resolves.toEqual(invitation)

    expect(invitationService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      permissions,
      invitedBy: "owner-1",
    })
  })
})

describe("PUT /v1/members/{memberId}", () => {
  const procedure = findProcedure("PUT", "/v1/members/{memberId}")

  test("updates and re-reads the member in the authenticated workspace", async () => {
    const updatedMember = { id: "member-1", user: { id: "user-1" } }
    workspaceMemberService.findByIdOrFail
      .mockResolvedValueOnce({ id: "member-1" })
      .mockResolvedValueOnce(updatedMember)
    workspaceMemberService.update.mockResolvedValueOnce({ id: "member-1" })

    await expect(
      procedure.handler?.({ context, input: updateInput }),
    ).resolves.toEqual(updatedMember)

    expect(workspaceMemberService.findByIdOrFail).toHaveBeenNthCalledWith(1, {
      id: "member-1",
      workspaceId: "workspace-1",
    })
    expect(workspaceMemberService.update).toHaveBeenCalledWith({
      id: "member-1",
      workspaceId: "workspace-1",
      data: {
        permissions,
        notificationTypes: updateInput.notificationTypes,
        notificationChannels: updateInput.notificationChannels,
      },
    })
    expect(workspaceMemberService.findByIdOrFail).toHaveBeenNthCalledWith(2, {
      id: "member-1",
      workspaceId: "workspace-1",
    })
  })
})

describe("DELETE /v1/members/{memberId}", () => {
  const procedure = findProcedure("DELETE", "/v1/members/{memberId}")

  test("removes a non-owner member in the authenticated workspace", async () => {
    workspaceMemberService.findByIdOrFail.mockResolvedValueOnce({
      id: "member-1",
      role: "agent",
    })
    workspaceMemberService.delete.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { memberId: "member-1" } }),
    ).resolves.toBeUndefined()

    expect(workspaceMemberService.findByIdOrFail).toHaveBeenCalledWith({
      id: "member-1",
      workspaceId: "workspace-1",
    })
    expect(workspaceMemberService.delete).toHaveBeenCalledWith({
      id: "member-1",
      workspaceId: "workspace-1",
    })
  })

  test("rejects removing the owner before calling workspaceMemberService.delete", async () => {
    workspaceMemberService.findByIdOrFail.mockResolvedValueOnce({
      id: "owner-member-1",
      role: "owner",
    })

    await expect(
      procedure.handler?.({ context, input: { memberId: "owner-member-1" } }),
    ).rejects.toThrow("You cannot delete the owner of the workspace")

    expect(workspaceMemberService.delete).not.toHaveBeenCalled()
  })
})
