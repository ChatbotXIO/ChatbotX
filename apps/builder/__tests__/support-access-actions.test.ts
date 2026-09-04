// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const SUPPORT_SESSION_ERROR_PATTERN = /support session/i

type Ctx = {
  user: { id: string }
  workspaceMemberPermissions: { superAdmin?: boolean }
  isSupportSession: boolean
}
type Handler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { enabled: boolean }
  ctx: Ctx
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

const { enable, disable } = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClientAllowScheduledDeletion:
    workspaceActionClientAllowScheduledDeletionChain,
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
    await expect(
      toggleHandler({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: { enabled: true },
        ctx: {
          user: { id: "user-1" },
          workspaceMemberPermissions: {},
          isSupportSession: false,
        },
      }),
    ).rejects.toThrow()

    expect(enable).not.toHaveBeenCalled()
    expect(disable).not.toHaveBeenCalled()
  })

  test("rejects a super admin acting from within a support session", async () => {
    await expect(
      toggleHandler({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: { enabled: true },
        ctx: {
          user: { id: "user-1" },
          workspaceMemberPermissions: { superAdmin: true },
          isSupportSession: true,
        },
      }),
    ).rejects.toThrow(SUPPORT_SESSION_ERROR_PATTERN)

    expect(enable).not.toHaveBeenCalled()
    expect(disable).not.toHaveBeenCalled()
  })

  test("enabled: true calls enable with actorUserId for a real superAdmin member", async () => {
    await toggleHandler({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { enabled: true },
      ctx: {
        user: { id: "user-1" },
        workspaceMemberPermissions: { superAdmin: true },
        isSupportSession: false,
      },
    })

    expect(enable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "user-1",
    })
    expect(disable).not.toHaveBeenCalled()
  })

  test("enabled: false calls disable with actorUserId for a real superAdmin member", async () => {
    await toggleHandler({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { enabled: false },
      ctx: {
        user: { id: "user-1" },
        workspaceMemberPermissions: { superAdmin: true },
        isSupportSession: false,
      },
    })

    expect(disable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "user-1",
    })
    expect(enable).not.toHaveBeenCalled()
  })
})
