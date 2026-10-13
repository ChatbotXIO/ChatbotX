// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const service = vi.hoisted(() => ({
  create: vi.fn(),
  publish: vi.fn(),
  update: vi.fn(),
  adjust: vi.fn(),
}))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  leaderboardService: {
    create: service.create,
    publish: service.publish,
    update: service.update,
  },
  leaderboardParticipantService: { adjust: service.adjust },
}))

vi.mock("@/lib/safe-action", () => {
  const client = {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
      action: (fn: unknown) => fn,
    }),
  }
  return {
    workspaceActionClient: client,
    workspaceActionClientAllowExpired: client,
  }
})

vi.mock("@/features/leaderboards/lib/view-url", () => ({
  buildLeaderboardViewUrl: (id: string) =>
    `https://app.test/leaderboards?leaderboardId=${id}`,
}))

type ActionFn = (props: unknown) => Promise<unknown>

const { createLeaderboardAction } = (await import(
  "../src/features/leaderboards/actions/create-leaderboard.action"
)) as unknown as { createLeaderboardAction: ActionFn }
const { adjustParticipantScoreAction } = (await import(
  "../src/features/leaderboards/actions/participant.action"
)) as unknown as { adjustParticipantScoreAction: ActionFn }

const config = {
  name: "October top fans",
  platform: "messenger",
  inboxId: "11",
  rules: { comments: { enabled: true, points: 30 } },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createLeaderboardAction", () => {
  test("creates a draft through leaderboardService.create with a view-url builder", async () => {
    service.create.mockResolvedValue({ id: "7" })

    const result = await createLeaderboardAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ...config, publish: false },
    })

    expect(service.create).toHaveBeenCalledWith(
      { ...config, workspaceId: "ws-1" },
      { buildViewUrl: expect.any(Function) },
    )
    const [, options] = service.create.mock.calls[0] as [
      unknown,
      { buildViewUrl: (id: string) => string },
    ]
    expect(options.buildViewUrl("7")).toContain("leaderboardId=7")
    expect(service.publish).not.toHaveBeenCalled()
    expect(result).toEqual({ id: "7", published: false, publishError: null })
  })

  test("publishes right after creating when publish is set", async () => {
    service.create.mockResolvedValue({ id: "7" })
    service.publish.mockResolvedValue({ id: "7", status: "active" })

    const result = await createLeaderboardAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ...config, publish: true },
    })

    expect(service.publish).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "7",
    })
    expect(result).toEqual({ id: "7", published: true, publishError: null })
  })

  test("keeps the draft and reports the publish error instead of throwing", async () => {
    const { ChatbotXException } = await import("@chatbotx.io/business/errors")
    service.create.mockResolvedValue({ id: "7" })
    service.publish.mockRejectedValue(
      new ChatbotXException(
        "Enable at least one scoring rule",
        "validation",
        422,
      ),
    )

    const result = await createLeaderboardAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ...config, publish: true },
    })

    expect(result).toEqual({
      id: "7",
      published: false,
      publishError: "Enable at least one scoring rule",
    })
  })
})

describe("adjustParticipantScoreAction", () => {
  test("passes the delta, reason and acting user to leaderboardParticipantService.adjust", async () => {
    service.adjust.mockResolvedValue({ score: 150 })

    const result = await adjustParticipantScoreAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { id: "7", contactId: "99", delta: -20, reason: "spam" },
      ctx: { user: { id: "user-1" } },
    })

    expect(service.adjust).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      leaderboardId: "7",
      contactId: "99",
      delta: -20,
      reason: "spam",
      actorUserId: "user-1",
    })
    expect(result).toEqual({ score: 150 })
  })
})
