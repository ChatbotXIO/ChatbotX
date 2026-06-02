import { beforeEach, describe, expect, test, vi } from "vitest"

const setSpy = vi.fn<(values: Record<string, unknown>) => unknown>()
const whereSpy = vi.fn<(...args: unknown[]) => unknown>()
const updateSpy = vi.fn<(table: unknown) => unknown>()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: (table: unknown) => {
      updateSpy(table)
      return {
        set: (values: Record<string, unknown>) => {
          setSpy(values)
          return {
            where: (...args: unknown[]) => {
              whereSpy(...args)
              return Promise.resolve()
            },
          }
        },
      }
    },
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  isNull: (column: unknown) => ({ __isNull: column }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
    broadcastSubscribedAt: { __column: "broadcastSubscribedAt" },
  },
  contactCustomFieldModel: {},
  contactNoteModel: {},
  contactsOnSequenceModel: {},
  contactsToTagsModel: {},
  conversationModel: {},
  tagModel: {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))
vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: vi.fn(),
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))
vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  cancelPendingDispatches: vi.fn(),
  enrollContactInSequence: vi.fn(),
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: () => "test-id" }))

const buildProps = () =>
  ({
    conversation: {
      contactId: "contact-1",
      workspaceId: "workspace-1",
    },
    step: {},
  }) as unknown as Parameters<
    typeof import("../src/integration/handlers/contact").subscribeBroadcast
  >[0]

beforeEach(() => {
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
})

describe("subscribeBroadcast", () => {
  test("sets broadcastSubscribedAt to current Date scoped by contact + workspace", async () => {
    const { subscribeBroadcast } = await import(
      "../src/integration/handlers/contact"
    )

    const before = Date.now()
    await subscribeBroadcast(buildProps())
    const after = Date.now()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(whereSpy).toHaveBeenCalledTimes(1)

    const setCall = setSpy.mock.calls[0][0]
    expect(setCall.broadcastSubscribedAt).toBeInstanceOf(Date)
    const ts = (setCall.broadcastSubscribedAt as Date).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)

    const whereArg = whereSpy.mock.calls[0][0] as { __and: unknown[] }
    expect(whereArg.__and).toHaveLength(3)
  })

  test("is idempotent — WHERE includes isNull guard to preserve original subscription date", async () => {
    const { subscribeBroadcast } = await import(
      "../src/integration/handlers/contact"
    )

    await subscribeBroadcast(buildProps())

    const whereArg = whereSpy.mock.calls[0][0] as {
      __and: Array<{ __isNull?: unknown }>
    }
    const hasIsNullGuard = whereArg.__and.some((c) => "__isNull" in c)
    expect(hasIsNullGuard).toBe(true)
  })
})

describe("unsubscribeBroadcast", () => {
  test("sets broadcastSubscribedAt to null scoped by contact + workspace", async () => {
    const { unsubscribeBroadcast } = await import(
      "../src/integration/handlers/contact"
    )

    await unsubscribeBroadcast(buildProps())

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(whereSpy).toHaveBeenCalledTimes(1)

    const setCall = setSpy.mock.calls[0][0]
    expect(setCall.broadcastSubscribedAt).toBeNull()

    const whereArg = whereSpy.mock.calls[0][0] as { __and: unknown[] }
    expect(whereArg.__and).toHaveLength(2)
  })
})
