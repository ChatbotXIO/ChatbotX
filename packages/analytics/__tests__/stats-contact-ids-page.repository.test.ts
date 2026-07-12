import { beforeEach, describe, expect, test, vi } from "vitest"

const queryBuilder = {
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}
queryBuilder.from.mockReturnValue(queryBuilder)
queryBuilder.where.mockReturnValue(queryBuilder)
queryBuilder.orderBy.mockReturnValue(queryBuilder)
queryBuilder.limit.mockResolvedValue([])

const select = vi.fn(() => queryBuilder)

vi.mock("@chatbotx.io/database/client", () => ({
  db: { select },
  and: (...args: unknown[]) => ({ op: "and", args }),
  count: vi.fn(),
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  gt: (column: unknown, value: unknown) => ({ op: "gt", column, value }),
  inArray: (column: unknown, values: unknown[]) => ({
    op: "inArray",
    column,
    values,
  }),
  isNotNull: (column: unknown) => ({ op: "isNotNull", column }),
  notInArray: (column: unknown, values: unknown[]) => ({
    op: "notInArray",
    column,
    values,
  }),
  or: (...args: unknown[]) => ({ op: "or", args }),
  sql: (strings: TemplateStringsArray) => ({ op: "sql", value: strings[0] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnBroadcastsModel: {
    broadcastId: "ContactOnBroadcast.broadcastId",
    contactId: "ContactOnBroadcast.contactId",
    deliveredAt: "ContactOnBroadcast.deliveredAt",
    failedAt: "ContactOnBroadcast.failedAt",
    seenAt: "ContactOnBroadcast.seenAt",
    clickedAt: "ContactOnBroadcast.clickedAt",
  },
  sequenceDispatchModel: {
    id: "SequenceDispatch.id",
    workspaceId: "SequenceDispatch.workspaceId",
    sequenceId: "SequenceDispatch.sequenceId",
    stepId: "SequenceDispatch.stepId",
    contactId: "SequenceDispatch.contactId",
    deliveredAt: "SequenceDispatch.deliveredAt",
    failedAt: "SequenceDispatch.failedAt",
    seenAt: "SequenceDispatch.seenAt",
    clickedAt: "SequenceDispatch.clickedAt",
  },
}))

const { BroadcastStatsRepository } = await import(
  "../src/repositories/postgres/broadcast-stats.repository"
)
const { SequenceStatsRepository } = await import(
  "../src/repositories/postgres/sequence-stats.repository"
)

const lastWhere = () => queryBuilder.where.mock.calls.at(-1)?.[0]

describe("stats contact id cursor pages", () => {
  beforeEach(() => {
    select.mockClear()
    queryBuilder.from.mockClear()
    queryBuilder.where.mockClear()
    queryBuilder.orderBy.mockClear()
    queryBuilder.limit.mockClear()
    queryBuilder.limit.mockResolvedValue([])
  })

  test("broadcast query uses contactId cursor, exclusions, and sent event condition", async () => {
    const repository = new BroadcastStatsRepository()

    await repository.getContactIdsPage({
      broadcastId: "broadcast-1",
      eventType: "message:sent",
      cursor: "contact-10",
      limit: 25,
      excludeContactIds: ["contact-2"],
    })

    expect(select).toHaveBeenCalledWith({
      id: "ContactOnBroadcast.contactId",
      contactId: "ContactOnBroadcast.contactId",
    })
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      "ContactOnBroadcast.contactId",
    )
    expect(queryBuilder.limit).toHaveBeenCalledWith(25)
    expect(lastWhere()).toEqual({
      op: "and",
      args: [
        {
          op: "eq",
          column: "ContactOnBroadcast.broadcastId",
          value: "broadcast-1",
        },
        {
          op: "or",
          args: [
            {
              op: "isNotNull",
              column: "ContactOnBroadcast.deliveredAt",
            },
            { op: "isNotNull", column: "ContactOnBroadcast.failedAt" },
          ],
        },
        {
          op: "gt",
          column: "ContactOnBroadcast.contactId",
          value: "contact-10",
        },
        {
          op: "notInArray",
          column: "ContactOnBroadcast.contactId",
          values: ["contact-2"],
        },
      ],
    })
  })

  test("sequence query uses dispatch id cursor and contactId exclusions", async () => {
    const repository = new SequenceStatsRepository()

    await repository.getContactIdsPage({
      workspaceId: "workspace-1",
      sequenceId: "sequence-1",
      stepId: "step-1",
      eventType: "message:failed",
      cursor: "dispatch-10",
      limit: 25,
      excludeContactIds: ["contact-2"],
    })

    expect(select).toHaveBeenCalledWith({
      id: "SequenceDispatch.id",
      contactId: "SequenceDispatch.contactId",
    })
    expect(queryBuilder.orderBy).toHaveBeenCalledWith("SequenceDispatch.id")
    expect(queryBuilder.limit).toHaveBeenCalledWith(25)
    expect(lastWhere()).toEqual({
      op: "and",
      args: [
        {
          op: "eq",
          column: "SequenceDispatch.workspaceId",
          value: "workspace-1",
        },
        {
          op: "eq",
          column: "SequenceDispatch.sequenceId",
          value: "sequence-1",
        },
        { op: "eq", column: "SequenceDispatch.stepId", value: "step-1" },
        { op: "isNotNull", column: "SequenceDispatch.failedAt" },
        { op: "gt", column: "SequenceDispatch.id", value: "dispatch-10" },
        {
          op: "notInArray",
          column: "SequenceDispatch.contactId",
          values: ["contact-2"],
        },
      ],
    })
  })
})
