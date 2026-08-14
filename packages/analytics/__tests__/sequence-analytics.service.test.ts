import type {
  MessageDeliveredPayload,
  MessageSeenPayload,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findManySpy =
  vi.fn<(args: { where: Record<string, unknown> }) => Promise<unknown[]>>()
const executeSpy = vi.fn<(query: string) => Promise<unknown>>()

function sql(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce(
    (acc, part, index) =>
      `${acc}${part}${index < values.length ? String(values[index]) : ""}`,
    "",
  )
}

sql.raw = (value: string) => value
sql.join = (values: unknown[], separator: string) => values.join(separator)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      sequenceDispatchModel: { findMany: findManySpy },
    },
    execute: executeSpy,
  },
  sql,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("../src/repositories/postgres", () => ({
  sequenceStatsRepository: {
    getContacts: vi.fn(),
    getStepStats: vi.fn(),
    updateFailedBulk: vi.fn(),
  },
}))

const deliveredPayload = {
  context: {
    workspaceId: "w1",
  },
  metadata: {
    type: "sequenceSchedule",
    sequenceId: "s1",
    sequenceStepId: "step1",
    contactInboxId: "ci1",
  },
  occurredAt: new Date("2026-06-01T00:00:00.000Z"),
} as unknown as MessageDeliveredPayload

const seenPayload = {
  context: {
    workspaceId: "w1",
    contactInboxId: "ci1",
  },
  metadata: {},
  occurredAt: new Date("2026-06-01T00:00:00.000Z"),
} as unknown as MessageSeenPayload

beforeEach(() => {
  findManySpy.mockReset()
  executeSpy.mockReset().mockResolvedValue(undefined)
})

describe("SequenceAnalyticsService dispatch updates", () => {
  test("updates delivered dispatches by id + workspaceId without guessing status", async () => {
    findManySpy.mockResolvedValue([
      {
        id: "d1",
        workspaceId: "w1",
        sequenceId: "s1",
        stepId: "step1",
        contactInboxId: "ci1",
      },
    ])
    const { sequenceAnalyticsService } = await import(
      "../src/services/sequence-analytics.service"
    )

    await sequenceAnalyticsService.onDelivered([deliveredPayload])

    expect(findManySpy.mock.calls[0][0].where).toMatchObject({
      workspaceId: { in: ["w1"] },
      sequenceId: { in: ["s1"] },
      stepId: { in: ["step1"] },
      contactInboxId: { in: ["ci1"] },
    })
    const query = executeSpy.mock.calls[0][0]
    expect(query).toContain('"id" = d1 AND "workspaceId" = w1')
    expect(query).not.toContain('"status" =')
  })

  test("adds status predicate only when caller selected completed dispatches", async () => {
    findManySpy
      .mockResolvedValueOnce([
        {
          sequenceId: "s1",
          stepId: "step1",
          contactInboxId: "ci1",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "d1",
          workspaceId: "w1",
          sequenceId: "s1",
          stepId: "step1",
          contactInboxId: "ci1",
        },
      ])
    const { sequenceAnalyticsService } = await import(
      "../src/services/sequence-analytics.service"
    )

    await sequenceAnalyticsService.onSeen([seenPayload])

    expect(findManySpy.mock.calls[1][0].where).toMatchObject({
      workspaceId: { in: ["w1"] },
      status: "completed",
    })
    expect(executeSpy.mock.calls[0][0]).toContain(
      '"id" = d1 AND "workspaceId" = w1 AND "status" = completed',
    )
  })
})
