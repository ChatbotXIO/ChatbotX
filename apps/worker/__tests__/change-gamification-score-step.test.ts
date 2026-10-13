import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers the "Change gamification scores" flow step handler
// (`changeGamificationScore` in apps/worker/src/integration/handlers/contact.ts).

const deleteByKey = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: { deleteByKey },
  contactService: { delete: vi.fn() },
  tagSyncService: { enqueueAttach: vi.fn(), enqueueDetach: vi.fn() },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(async () => ({})),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))

const changeFromFlow = vi.fn(async () => ({ status: "applied", results: [] }))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  leaderboardScoringService: { changeFromFlow },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: { removeContactSequencesForContact: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  isNull: (col: unknown) => ({ isNull: col }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {},
  contactNoteModel: {},
  contactsToTagsModel: {},
  tagModel: {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))

vi.mock("@chatbotx.io/events", () => ({
  emitContactUnsubscribed: vi.fn(),
  emitSequenceSubscribed: vi.fn(),
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  enrollContactInSequence: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "generated-id") }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { changeGamificationScore } = await import(
  "../src/integration/handlers/contact"
)

const run = (step: Record<string, unknown>) =>
  changeGamificationScore({
    conversation: { workspaceId: "ws-1", contactId: "c-1" },
    contactInbox: { id: "ci-1" },
    step: {
      id: "s-1",
      stepType: "changeGamificationScore",
      leaderboardId: "lb-1",
      operation: "add",
      points: 25,
      targetUser: true,
      targetReferrer: false,
      ...step,
    },
  } as never)

describe("changeGamificationScore", () => {
  beforeEach(() => {
    changeFromFlow.mockClear()
  })

  test("forwards the leaderboard, operation, points and targets", async () => {
    await run({ operation: "subtract", targetReferrer: true })
    expect(changeFromFlow).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      leaderboardId: "lb-1",
      contactId: "c-1",
      operation: "subtract",
      points: 25,
      targets: { user: true, referrer: true },
      dedup: null,
    })
  })

  test("a step with an execution key dedups retries on key + step id", async () => {
    const at = new Date("2026-10-12T08:00:00Z")
    await changeGamificationScore({
      conversation: { workspaceId: "ws-1", contactId: "c-1" },
      contactInbox: { id: "ci-1" },
      flowExecutionKey: "exec-1",
      triggerMessageCreatedAt: at,
      step: {
        id: "s-1",
        stepType: "changeGamificationScore",
        leaderboardId: "lb-1",
        operation: "add",
        points: 5,
        targetUser: true,
        targetReferrer: false,
      },
    } as never)
    expect(changeFromFlow).toHaveBeenCalledWith(
      expect.objectContaining({ dedup: { key: "exec-1:s-1", at } }),
    )
  })

  test("does nothing without a leaderboard or any target", async () => {
    await run({ leaderboardId: undefined })
    await run({ targetUser: false, targetReferrer: false })
    expect(changeFromFlow).not.toHaveBeenCalled()
  })
})
