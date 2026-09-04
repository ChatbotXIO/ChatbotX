// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: {
  ctx: { user: { id: string } }
  parsedInput: unknown
}) => Promise<unknown>

const capturedActions: Handler[] = []

function makeChainSpy() {
  const bindArgsSchemas = vi.fn()
  const inputSchema = vi.fn()
  const action = vi.fn()
  const chain = { bindArgsSchemas, inputSchema, action }
  bindArgsSchemas.mockReturnValue(chain)
  inputSchema.mockReturnValue(chain)
  action.mockImplementation((handler: Handler) => {
    capturedActions.push(handler)
    return handler
  })
  return chain
}

const workspaceActionClientAllowScheduledDeletionChain = makeChainSpy()

const mockGetCurrentUserAndTargetWorkspace = vi.fn()

const { enable, disable } = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClientAllowScheduledDeletion:
    workspaceActionClientAllowScheduledDeletionChain,
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))
vi.mock("@chatbotx.io/business", () => ({
  workspaceSupportAccessService: { enable, disable },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("toggleSupportAccessAction", () => {
  let toggleHandler: Handler

  beforeEach(async () => {
    const { toggleSupportAccessAction } = await import(
      "@/features/workspaces/actions/toggle-support-access.action"
    )
    expect(toggleSupportAccessAction).toBeDefined()
    toggleHandler = capturedActions.at(-1) as Handler
  })

  test("rejects when the caller lacks superAdmin permission", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: {} },
    })

    await expect(
      toggleHandler({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: { enabled: true },
      } as never),
    ).rejects.toThrow()

    expect(enable).not.toHaveBeenCalled()
    expect(disable).not.toHaveBeenCalled()
  })

  test("enabled: true calls enable with actorUserId", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { superAdmin: true } },
    })

    await toggleHandler({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { enabled: true },
    } as never)

    expect(enable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "user-1",
    })
    expect(disable).not.toHaveBeenCalled()
  })

  test("enabled: false calls disable with actorUserId", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { superAdmin: true } },
    })

    await toggleHandler({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { enabled: false },
    } as never)

    expect(disable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "user-1",
    })
    expect(enable).not.toHaveBeenCalled()
  })
})
