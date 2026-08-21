// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest"

const mockHasWorkspacePermission = vi.fn()
const mockFindOrFail = vi.fn()
const mockDbTransaction = vi.fn()
const mockIsCommunity = vi.fn(() => false)
const SUPER_ADMIN_ERROR_RE = /super admin/i

vi.mock("@/env", () => ({ isCommunity: mockIsCommunity }))

vi.mock("@/features/tenant/utils", () => ({
  getTenantSettings: vi.fn(async () => ({
    appUrl: "https://app.chatbotx.io",
  })),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return {
    workspaceActionClient: chain,
  }
})

vi.mock("@/lib/auth/permission-routes", () => ({
  hasWorkspacePermission: mockHasWorkspacePermission,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mockDbTransaction },
  eq: vi.fn(),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationWebchatModel: { id: "id-column" },
}))

const { updateWebchatAction } = await import(
  "../src/features/integration-webchat/actions/update-webchat.action"
)

// The action reads the caller's permissions from the middleware ctx
// (workspaceActionClient already loads the member row), so no user/member
// fetch happens inside the action itself.
const makeInput = (permissions: Record<string, unknown>) => ({
  bindArgsParsedInputs: ["workspace-1", "webchat-1"],
  parsedInput: {
    name: "Support",
    brandColor: "#007bff",
    hideHeader: false,
    showLogo: true,
    hideMessageInput: false,
  },
  ctx: { workspaceMemberPermissions: permissions },
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFindOrFail.mockResolvedValue({ id: "webchat-1" })
  mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      update: () => ({ set: () => ({ where: vi.fn() }) }),
    }),
  )
})

test("rejects a workspace member without superAdmin permission", async () => {
  mockHasWorkspacePermission.mockReturnValue(false)

  await expect(
    (updateWebchatAction as (props: unknown) => Promise<unknown>)(
      makeInput({}),
    ),
  ).rejects.toThrow(SUPER_ADMIN_ERROR_RE)

  // The permission check must short-circuit before any write is attempted —
  // this is the guard that closes the bypass of the edit page's
  // requireWorkspacePermission(workspaceId, "superAdmin") gate.
  expect(mockFindOrFail).not.toHaveBeenCalled()
  expect(mockDbTransaction).not.toHaveBeenCalled()
})

test("gates on the permissions supplied by the middleware ctx", async () => {
  mockHasWorkspacePermission.mockReturnValue(false)

  await expect(
    (updateWebchatAction as (props: unknown) => Promise<unknown>)(
      makeInput({ superAdmin: false }),
    ),
  ).rejects.toThrow(SUPER_ADMIN_ERROR_RE)

  expect(mockHasWorkspacePermission).toHaveBeenCalledWith(
    { superAdmin: false },
    "superAdmin",
  )
  expect(mockDbTransaction).not.toHaveBeenCalled()
})

test("proceeds to update when the caller is a superAdmin", async () => {
  mockHasWorkspacePermission.mockReturnValue(true)

  await (updateWebchatAction as (props: unknown) => Promise<unknown>)(
    makeInput({ superAdmin: true }),
  )

  expect(mockFindOrFail).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "webchat-1", workspaceId: "workspace-1" },
    }),
  )
  expect(mockDbTransaction).toHaveBeenCalled()
})
