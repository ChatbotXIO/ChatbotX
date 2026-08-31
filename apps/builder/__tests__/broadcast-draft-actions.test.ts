// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput?: unknown
}) => Promise<unknown>

type CapturedAction = { client: "normal" | "allowExpired"; handler: Handler }

// The global vitest preset sets `clearMocks`/`restoreMocks`, which wipes
// every vi.fn()'s `.mock.calls` before each test runs — so a spy's call
// history recorded at *module import* time (this file's top-level code,
// which runs once) would never survive to be asserted inside a `test()`.
// Recording into a plain array (not vi.fn() state) instead survives that
// reset, and lets tests assert which client (`workspaceActionClient` vs
// `workspaceActionClientAllowExpired`) each action was actually built from.
const capturedActions: CapturedAction[] = []

function makeChainSpy(client: CapturedAction["client"]) {
  const bindArgsSchemas = vi.fn()
  const inputSchema = vi.fn()
  const action = vi.fn()
  const chain = { bindArgsSchemas, inputSchema, action }
  bindArgsSchemas.mockReturnValue(chain)
  inputSchema.mockReturnValue(chain)
  action.mockImplementation((handler: Handler) => {
    capturedActions.push({ client, handler })
    return handler
  })
  return chain
}

const workspaceActionClientChain = makeChainSpy("normal")
const workspaceActionClientAllowExpiredChain = makeChainSpy("allowExpired")

const { scheduleDraft, deleteDraft, recordAuditLog } = vi.hoisted(() => ({
  scheduleDraft: vi.fn(),
  deleteDraft: vi.fn(),
  recordAuditLog: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: workspaceActionClientChain,
  workspaceActionClientAllowExpired: workspaceActionClientAllowExpiredChain,
}))
vi.mock("@chatbotx.io/business", () => ({
  broadcastService: { scheduleDraft, deleteDraft },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => recordAuditLog(...args) },
}))

await import("@/features/broadcasts/actions/schedule-broadcast.action")
await import("@/features/broadcasts/actions/delete-broadcast.action")
const [
  { handler: scheduleHandler },
  { client: deleteActionClient, handler: deleteHandler },
] = capturedActions
const { scheduleBroadcastSchema } = await import(
  "@/features/broadcasts/schema/action"
)

beforeEach(() => {
  scheduleDraft.mockReset()
  deleteDraft.mockReset()
  recordAuditLog.mockReset().mockResolvedValue(undefined)
})

describe("scheduleBroadcastSchema", () => {
  test("accepts now with a null time", () => {
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "now",
        schedulesAt: null,
      }).success,
    ).toBe(true)
  })

  test("rejects future with a null or past time", () => {
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "future",
        schedulesAt: null,
      }).success,
    ).toBe(false)
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "future",
        schedulesAt: "2020-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false)
  })

  test("accepts future with a later time", () => {
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "future",
        schedulesAt: "2999-01-01T00:00:00.000Z",
      }).success,
    ).toBe(true)
  })

  test("rejects a future time whose minute-start is not after now", () => {
    // 20s into the *current* minute rounds down (startOfMinute) to a value
    // that is what actually gets persisted — so it must fail validation
    // too. Anchored to the current minute boundary (rather than
    // `Date.now() + 20_000`) so the assertion is not flaky when the test
    // happens to run in the last 20s of a minute.
    const startOfCurrentMinuteMs = Math.floor(Date.now() / 60_000) * 60_000
    const schedulesAt = new Date(startOfCurrentMinuteMs + 20_000).toISOString()
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "future",
        schedulesAt,
      }).success,
    ).toBe(false)
  })

  test("accepts a time at least 1 minute ahead", () => {
    const schedulesAt = new Date(Date.now() + 90_000).toISOString()
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "future",
        schedulesAt,
      }).success,
    ).toBe(true)
  })
})

describe("scheduleBroadcastAction", () => {
  test("schedules now with the current minute when schedulesAt is null", async () => {
    scheduleDraft.mockResolvedValue({ id: "b-1" })

    await scheduleHandler({
      bindArgsParsedInputs: ["ws-1", "b-1"],
      parsedInput: { schedulesType: "now", schedulesAt: null },
    })

    const input = scheduleDraft.mock.calls[0][0]
    expect(input).toMatchObject({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
    })
    expect(input.schedulesAt.getSeconds()).toBe(0)
    expect(input.schedulesAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(recordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "launch",
      detail: "launched a broadcast (#b-1)",
    })
  })

  test("passes the chosen future time", async () => {
    scheduleDraft.mockResolvedValue({ id: "b-1" })

    await scheduleHandler({
      bindArgsParsedInputs: ["ws-1", "b-1"],
      parsedInput: {
        schedulesType: "future",
        schedulesAt: "2030-01-01T09:30:00.000Z",
      },
    })

    expect(scheduleDraft.mock.calls[0][0].schedulesAt.toISOString()).toBe(
      "2030-01-01T09:30:00.000Z",
    )
    // A future schedule is not a launch yet — the send has not happened.
    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})

describe("deleteBroadcastAction", () => {
  test("is built from workspaceActionClientAllowExpired so trial-expired workspaces can still delete drafts", () => {
    expect(deleteActionClient).toBe("allowExpired")
  })

  test("delegates to broadcastService.deleteDraft with the bound ids", async () => {
    deleteDraft.mockResolvedValue(undefined)
    await deleteHandler({ bindArgsParsedInputs: ["ws-1", "b-1"] })
    expect(deleteDraft).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })
  })
})
