import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  actionExecute,
  insertTriggerExecution,
  listContactCustomFieldsForDateTimeSweep,
  listContactCustomFieldsForDateTimeSweepContacts,
  triggerExecutionFindMany,
  triggerFindMany,
} = vi.hoisted(() => ({
  actionExecute: vi.fn(),
  insertTriggerExecution: vi.fn(),
  listContactCustomFieldsForDateTimeSweep: vi.fn(),
  listContactCustomFieldsForDateTimeSweepContacts: vi.fn(),
  triggerExecutionFindMany: vi.fn(),
  triggerFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    execute: vi.fn(),
    insert: insertTriggerExecution,
    query: {
      triggerExecutionModel: {
        findMany: triggerExecutionFindMany,
      },
      triggerModel: {
        findMany: triggerFindMany,
      },
    },
  },
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  listContactCustomFieldsForDateTimeSweep,
  listContactCustomFieldsForDateTimeSweepContacts,
}))

const redis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
}

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: () => redis,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("../src/trigger/services/action-executor", () => ({
  ActionExecutor: class {
    execute = actionExecute
  },
}))

const { evaluateDateTimeTriggers } = await import(
  "../src/trigger/services/datetime-trigger-evaluator"
)

const dateTimeCondition = (
  customFieldId: string,
  overrides: { at?: string; timezone?: string } = {},
) => ({
  id: `condition-${customFieldId}`,
  type: triggerEventTypes.enum.dateTimeBasedTrigger,
  sourceId: customFieldId,
  value: {
    triggerType: "atTheDayOf",
    at: overrides.at ?? "14",
    timeValue: 0,
    timeType: "minutes",
    // Only stamp the key when a zone is provided so `dateTimeCondition(id)`
    // still reproduces a legacy condition saved before timezone capture.
    ...(overrides.timezone ? { timezone: overrides.timezone } : {}),
  },
})

const triggerRow = (params: {
  actions?: unknown[]
  conditions: ReturnType<typeof dateTimeCondition>[]
  id: string
  timezone?: string
}) => ({
  id: params.id,
  workspaceId: "workspace-1",
  actions: params.actions ?? [{ type: "sendMessage" }],
  conditions: params.conditions,
  workspace: { timezone: params.timezone ?? "UTC" },
})

const contactCustomFieldRow = (params: {
  contactId: string
  customFieldId: string
  value?: string
}) => ({
  contactId: params.contactId,
  customFieldId: params.customFieldId,
  value: params.value ?? "2026-07-11T14:00:00.000Z",
  contact: { workspaceId: "workspace-1" },
})

describe("evaluateDateTimeTriggers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    actionExecute.mockResolvedValue(undefined)
    triggerExecutionFindMany.mockResolvedValue([])
    insertTriggerExecution.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    })
    redis.get.mockResolvedValue(null)
    redis.set.mockResolvedValue("OK")
    redis.setex.mockResolvedValue("OK")
    redis.del.mockResolvedValue(1)
  })

  test("scans contact custom fields once across multiple trigger chunks", async () => {
    const firstTriggerChunk = [
      triggerRow({
        id: "trigger-001",
        conditions: [dateTimeCondition("field-1")],
      }),
      ...Array.from({ length: 99 }, (_, index) =>
        triggerRow({
          id: `trigger-${String(index + 2).padStart(3, "0")}`,
          conditions: [],
        }),
      ),
    ]
    triggerFindMany
      .mockResolvedValueOnce(firstTriggerChunk)
      .mockResolvedValueOnce([
        triggerRow({
          id: "trigger-101",
          conditions: [dateTimeCondition("field-2")],
        }),
      ])
    listContactCustomFieldsForDateTimeSweep
      .mockResolvedValueOnce({
        rows: [
          contactCustomFieldRow({
            contactId: "contact-1",
            customFieldId: "field-1",
          }),
        ],
        nextCursor: { customFieldId: "field-1", id: "ccf-1" },
      })
      .mockResolvedValueOnce({
        rows: [
          contactCustomFieldRow({
            contactId: "contact-2",
            customFieldId: "field-2",
          }),
        ],
        nextCursor: undefined,
      })
    listContactCustomFieldsForDateTimeSweepContacts
      .mockResolvedValueOnce([
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
        }),
      ])
      .mockResolvedValueOnce([
        contactCustomFieldRow({
          contactId: "contact-2",
          customFieldId: "field-2",
        }),
      ])

    const results = await evaluateDateTimeTriggers({
      startOfMinute: Date.parse("2026-07-11T14:05:00.000Z"),
    })

    expect(results).toEqual([
      { triggerId: "trigger-001", contactId: "contact-1", matched: true },
      { triggerId: "trigger-101", contactId: "contact-2", matched: true },
    ])
    expect(listContactCustomFieldsForDateTimeSweep).toHaveBeenCalledTimes(2)
    expect(listContactCustomFieldsForDateTimeSweep).toHaveBeenNthCalledWith(1, {
      customFieldIds: ["field-1", "field-2"],
      cursor: undefined,
      limit: 1000,
    })
    expect(listContactCustomFieldsForDateTimeSweep).toHaveBeenNthCalledWith(2, {
      customFieldIds: ["field-1", "field-2"],
      cursor: { customFieldId: "field-1", id: "ccf-1" },
      limit: 1000,
    })
    expect(
      listContactCustomFieldsForDateTimeSweepContacts,
    ).toHaveBeenNthCalledWith(1, {
      contactIds: ["contact-1"],
      customFieldIds: ["field-1"],
    })
    expect(
      listContactCustomFieldsForDateTimeSweepContacts,
    ).toHaveBeenNthCalledWith(2, {
      contactIds: ["contact-2"],
      customFieldIds: ["field-2"],
    })
    expect(actionExecute).toHaveBeenCalledTimes(2)
  })

  test("waits for all datetime conditions before executing a trigger across cursor pages", async () => {
    triggerFindMany.mockResolvedValueOnce([
      triggerRow({
        id: "trigger-001",
        conditions: [
          dateTimeCondition("field-1"),
          dateTimeCondition("field-2"),
        ],
      }),
    ])
    listContactCustomFieldsForDateTimeSweep
      .mockResolvedValueOnce({
        rows: [
          contactCustomFieldRow({
            contactId: "contact-1",
            customFieldId: "field-1",
          }),
        ],
        nextCursor: { customFieldId: "field-1", id: "ccf-1" },
      })
      .mockResolvedValueOnce({
        rows: [
          contactCustomFieldRow({
            contactId: "contact-1",
            customFieldId: "field-2",
          }),
        ],
        nextCursor: undefined,
      })
    listContactCustomFieldsForDateTimeSweepContacts
      .mockResolvedValueOnce([
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
        }),
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-2",
        }),
      ])
      .mockResolvedValueOnce([
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
        }),
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-2",
        }),
      ])

    const results = await evaluateDateTimeTriggers({
      startOfMinute: Date.parse("2026-07-11T14:05:00.000Z"),
    })

    expect(results).toEqual([
      { triggerId: "trigger-001", contactId: "contact-1", matched: true },
    ])
    expect(actionExecute).toHaveBeenCalledTimes(1)
    expect(
      listContactCustomFieldsForDateTimeSweepContacts,
    ).toHaveBeenCalledWith({
      contactIds: ["contact-1"],
      customFieldIds: ["field-1", "field-2"],
    })
  })

  test("does not execute a multi-condition trigger when only one datetime condition is present", async () => {
    triggerFindMany.mockResolvedValueOnce([
      triggerRow({
        id: "trigger-001",
        conditions: [
          dateTimeCondition("field-1"),
          dateTimeCondition("field-2"),
        ],
      }),
    ])
    listContactCustomFieldsForDateTimeSweep.mockResolvedValueOnce({
      rows: [
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
        }),
      ],
      nextCursor: undefined,
    })
    listContactCustomFieldsForDateTimeSweepContacts.mockResolvedValueOnce([
      contactCustomFieldRow({
        contactId: "contact-1",
        customFieldId: "field-1",
      }),
    ])

    const results = await evaluateDateTimeTriggers({
      startOfMinute: Date.parse("2026-07-11T14:05:00.000Z"),
    })

    expect(results).toEqual([])
    expect(actionExecute).not.toHaveBeenCalled()
  })

  test("resolves the target field in the condition's captured timezone over the workspace zone", async () => {
    // Workspace is UTC, but the condition was saved in Asia/Ho_Chi_Minh (+7).
    // 14:00 UTC is 21:00 in +7, so `at: "21"` only fires when the condition's
    // own zone is honored — a UTC resolution would land on hour 14 and miss.
    triggerFindMany.mockResolvedValueOnce([
      triggerRow({
        id: "trigger-001",
        timezone: "UTC",
        conditions: [
          dateTimeCondition("field-1", {
            at: "21",
            timezone: "Asia/Ho_Chi_Minh",
          }),
        ],
      }),
    ])
    listContactCustomFieldsForDateTimeSweep.mockResolvedValueOnce({
      rows: [
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
          value: "2026-07-11T02:00:00.000Z",
        }),
      ],
      nextCursor: undefined,
    })
    listContactCustomFieldsForDateTimeSweepContacts.mockResolvedValueOnce([
      contactCustomFieldRow({
        contactId: "contact-1",
        customFieldId: "field-1",
        value: "2026-07-11T02:00:00.000Z",
      }),
    ])

    const results = await evaluateDateTimeTriggers({
      startOfMinute: Date.parse("2026-07-11T14:00:00.000Z"),
    })

    expect(results).toEqual([
      { triggerId: "trigger-001", contactId: "contact-1", matched: true },
    ])
    expect(actionExecute).toHaveBeenCalledTimes(1)
  })

  test("falls back to the workspace timezone for legacy conditions with no captured zone", async () => {
    // The condition predates timezone capture (no zone stored), so day
    // boundaries and hour-of-day must resolve in the workspace zone (+7).
    triggerFindMany.mockResolvedValueOnce([
      triggerRow({
        id: "trigger-001",
        timezone: "Asia/Ho_Chi_Minh",
        conditions: [dateTimeCondition("field-1", { at: "21" })],
      }),
    ])
    listContactCustomFieldsForDateTimeSweep.mockResolvedValueOnce({
      rows: [
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
          value: "2026-07-11T02:00:00.000Z",
        }),
      ],
      nextCursor: undefined,
    })
    listContactCustomFieldsForDateTimeSweepContacts.mockResolvedValueOnce([
      contactCustomFieldRow({
        contactId: "contact-1",
        customFieldId: "field-1",
        value: "2026-07-11T02:00:00.000Z",
      }),
    ])

    const results = await evaluateDateTimeTriggers({
      startOfMinute: Date.parse("2026-07-11T14:00:00.000Z"),
    })

    expect(results).toEqual([
      { triggerId: "trigger-001", contactId: "contact-1", matched: true },
    ])
    expect(actionExecute).toHaveBeenCalledTimes(1)
  })
})
