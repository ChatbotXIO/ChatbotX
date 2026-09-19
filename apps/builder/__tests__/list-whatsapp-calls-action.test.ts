// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  ctx: {
    user: { id: string }
    workspaceMemberPermissions: Record<string, boolean>
  }
  parsedInput: {
    activity?: string
    inboxId?: string
    agentUserId?: string
    cursor?: string
  }
}) => Promise<unknown>

const { listWhatsappCallsMock } = vi.hoisted(() => ({
  listWhatsappCallsMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { callHistoryActionClient: chain }
})

vi.mock("@/features/whatsapp-calls/queries/list-whatsapp-calls.query", () => ({
  listWhatsappCalls: listWhatsappCallsMock,
}))

const { listWhatsappCallsAction } = await import(
  "../src/features/whatsapp-calls/actions/list-whatsapp-calls.action"
)
const getAction = listWhatsappCallsAction as unknown as ActionHandler

describe("listWhatsappCallsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listWhatsappCallsMock.mockResolvedValue({ data: [], nextCursor: null })
  })

  test("forwards workspaceId, activity, cursor and the caller's member (userId + permissions) to the query adapter", async () => {
    await getAction({
      bindArgsParsedInputs: ["ws-1"],
      ctx: {
        user: { id: "user-1" },
        workspaceMemberPermissions: { contacts: true },
      },
      parsedInput: { activity: "missed", cursor: "opaque-cursor" },
    })

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      { workspaceId: "ws-1", activity: "missed", cursor: "opaque-cursor" },
      { userId: "user-1", permissions: { contacts: true } },
    )
  })

  test("uses ctx.user.id — not a bare ctx.userId — for the member passed downstream", async () => {
    await getAction({
      bindArgsParsedInputs: ["ws-1"],
      ctx: {
        user: { id: "support-user-1" },
        workspaceMemberPermissions: { superAdmin: true },
      },
      parsedInput: {},
    })

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "support-user-1",
      permissions: { superAdmin: true },
    })
  })

  test("forwards inboxId and agentUserId from parsedInput", async () => {
    await getAction({
      bindArgsParsedInputs: ["ws-1"],
      ctx: {
        user: { id: "user-1" },
        workspaceMemberPermissions: { superAdmin: true },
      },
      parsedInput: { inboxId: "inbox-1", agentUserId: "agent-1" },
    })

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        agentUserId: "agent-1",
      },
      { userId: "user-1", permissions: { superAdmin: true } },
    )
  })

  test("propagates a query-adapter rejection (e.g. InvalidWhatsappCallCursorError) instead of masking it", async () => {
    listWhatsappCallsMock.mockRejectedValueOnce(new Error("bad cursor"))

    await expect(
      getAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: {
          user: { id: "user-1" },
          workspaceMemberPermissions: { contacts: true },
        },
        parsedInput: { cursor: "corrupted" },
      }),
    ).rejects.toThrow("bad cursor")
  })
})
