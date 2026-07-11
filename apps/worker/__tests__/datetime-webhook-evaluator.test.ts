import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  cleanupOldWebhookExecutions,
  listActiveDateTimeWebhooks,
  listContactCustomFieldsForDateTimeSweep,
  listExecutedWebhookPairs,
  markWebhookExecuted,
} = vi.hoisted(() => ({
  cleanupOldWebhookExecutions: vi.fn(),
  listActiveDateTimeWebhooks: vi.fn(),
  listContactCustomFieldsForDateTimeSweep: vi.fn(),
  listExecutedWebhookPairs: vi.fn(),
  markWebhookExecuted: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  cleanupOldWebhookExecutions,
  listActiveDateTimeWebhooks,
  listContactCustomFieldsForDateTimeSweep,
  listExecutedWebhookPairs,
  markWebhookExecuted,
}))

const redis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
}
const webhookQueueAdd = vi.fn()

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: () => redis,
  WebhookJobAction: { evaluateWebhooks: "evaluateWebhooks" },
  webhookQueue: { add: webhookQueueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { cleanupWebhookExecutionsOlderThan, evaluateDateTimeWebhooks } =
  await import("../src/webhook/services/datetime-webhook-evaluator")

const contactCustomFieldRow = (params: {
  contactId: string
  customFieldId: string
  value: string
  workspaceId?: string
}) => ({
  contactId: params.contactId,
  customFieldId: params.customFieldId,
  value: params.value,
  contact: { workspaceId: params.workspaceId ?? "workspace-1" },
})

function mockDateTimeWebhook(
  conditions = [
    {
      type: triggerEventTypes.enum.dateTimeBasedTrigger,
      sourceId: "field-1",
      value: {
        triggerType: "atTheDayOf",
        at: "14",
        timeValue: 0,
        timeType: "minutes",
      },
    },
  ],
) {
  listActiveDateTimeWebhooks.mockResolvedValueOnce({
    nextCursor: undefined,
    webhooks: [
      {
        id: "webhook-1",
        workspaceId: "workspace-1",
        workspace: { timezone: "UTC" },
        conditions,
      },
    ],
  })
}

describe("evaluateDateTimeWebhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redis.get.mockResolvedValue(null)
    redis.set.mockResolvedValue("OK")
    redis.setex.mockResolvedValue("OK")
    redis.del.mockResolvedValue(1)
    webhookQueueAdd.mockResolvedValue(undefined)
    markWebhookExecuted.mockResolvedValue(undefined)
  })

  test("enqueues a webhook evaluation and marks execution when datetime condition matches", async () => {
    mockDateTimeWebhook()
    listContactCustomFieldsForDateTimeSweep.mockResolvedValueOnce({
      rows: [
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
          value: "2026-07-11T14:00:00.000Z",
        }),
      ],
      nextCursor: undefined,
    })
    listExecutedWebhookPairs.mockResolvedValueOnce(new Set())

    const results = await evaluateDateTimeWebhooks({
      startOfMinute: Date.parse("2026-07-11T14:05:00.000Z"),
    })

    expect(results).toEqual([
      { webhookId: "webhook-1", contactId: "contact-1", matched: true },
    ])
    expect(webhookQueueAdd).toHaveBeenCalledWith(
      "evaluate-webhooks",
      {
        type: "evaluateWebhooks",
        data: {
          workspaceId: "workspace-1",
          contactId: "contact-1",
          eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
          eventData: { sourceId: "field-1" },
          timestamp: expect.any(Date),
        },
      },
      {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    )
    expect(markWebhookExecuted).toHaveBeenCalledWith({
      webhookId: "webhook-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
    })
    expect(redis.setex).toHaveBeenCalledWith(
      "webhook:executed:webhook-1:contact-1",
      86_400 * 90,
      "1",
    )
  })

  test("skips queueing when the webhook-contact pair already executed", async () => {
    mockDateTimeWebhook()
    listContactCustomFieldsForDateTimeSweep.mockResolvedValueOnce({
      rows: [
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
          value: "2026-07-11T14:00:00.000Z",
        }),
      ],
      nextCursor: undefined,
    })
    listExecutedWebhookPairs.mockResolvedValueOnce(
      new Set(["webhook-1:contact-1"]),
    )

    const results = await evaluateDateTimeWebhooks({
      startOfMinute: Date.parse("2026-07-11T14:05:00.000Z"),
    })

    expect(results).toEqual([])
    expect(webhookQueueAdd).not.toHaveBeenCalled()
    expect(markWebhookExecuted).not.toHaveBeenCalled()
  })

  test("enqueues when any datetime condition matches and uses the matched source id", async () => {
    mockDateTimeWebhook([
      {
        type: triggerEventTypes.enum.dateTimeBasedTrigger,
        sourceId: "field-1",
        value: {
          triggerType: "atTheDayOf",
          at: "9",
          timeValue: 0,
          timeType: "minutes",
        },
      },
      {
        type: triggerEventTypes.enum.dateTimeBasedTrigger,
        sourceId: "field-2",
        value: {
          triggerType: "atTheDayOf",
          at: "14",
          timeValue: 0,
          timeType: "minutes",
        },
      },
    ])
    listContactCustomFieldsForDateTimeSweep.mockResolvedValueOnce({
      rows: [
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-1",
          value: "2026-07-11T09:00:00.000Z",
        }),
        contactCustomFieldRow({
          contactId: "contact-1",
          customFieldId: "field-2",
          value: "2026-07-11T14:00:00.000Z",
        }),
      ],
      nextCursor: undefined,
    })
    listExecutedWebhookPairs.mockResolvedValueOnce(new Set())

    const results = await evaluateDateTimeWebhooks({
      startOfMinute: Date.parse("2026-07-11T14:05:00.000Z"),
    })

    expect(results).toEqual([
      { webhookId: "webhook-1", contactId: "contact-1", matched: true },
    ])
    expect(webhookQueueAdd).toHaveBeenCalledWith(
      "evaluate-webhooks",
      expect.objectContaining({
        data: expect.objectContaining({
          eventData: { sourceId: "field-2" },
        }),
      }),
      expect.any(Object),
    )
  })

  test("scans contact custom fields once across multiple webhook chunks", async () => {
    listActiveDateTimeWebhooks
      .mockResolvedValueOnce({
        nextCursor: "webhook-1",
        webhooks: [
          {
            id: "webhook-1",
            workspaceId: "workspace-1",
            workspace: { timezone: "UTC" },
            conditions: [
              {
                type: triggerEventTypes.enum.dateTimeBasedTrigger,
                sourceId: "field-1",
                value: {
                  triggerType: "atTheDayOf",
                  at: "14",
                  timeValue: 0,
                  timeType: "minutes",
                },
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        nextCursor: undefined,
        webhooks: [
          {
            id: "webhook-2",
            workspaceId: "workspace-1",
            workspace: { timezone: "UTC" },
            conditions: [
              {
                type: triggerEventTypes.enum.dateTimeBasedTrigger,
                sourceId: "field-2",
                value: {
                  triggerType: "atTheDayOf",
                  at: "14",
                  timeValue: 0,
                  timeType: "minutes",
                },
              },
            ],
          },
        ],
      })
    listContactCustomFieldsForDateTimeSweep
      .mockResolvedValueOnce({
        rows: [
          contactCustomFieldRow({
            contactId: "contact-1",
            customFieldId: "field-1",
            value: "2026-07-11T14:00:00.000Z",
          }),
        ],
        nextCursor: { customFieldId: "field-1", id: "ccf-1" },
      })
      .mockResolvedValueOnce({
        rows: [
          contactCustomFieldRow({
            contactId: "contact-2",
            customFieldId: "field-2",
            value: "2026-07-11T14:00:00.000Z",
          }),
        ],
        nextCursor: undefined,
      })
    listExecutedWebhookPairs.mockResolvedValue(new Set())

    const results = await evaluateDateTimeWebhooks({
      startOfMinute: Date.parse("2026-07-11T14:05:00.000Z"),
    })

    expect(results).toEqual([
      { webhookId: "webhook-1", contactId: "contact-1", matched: true },
      { webhookId: "webhook-2", contactId: "contact-2", matched: true },
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
  })
})

describe("cleanupWebhookExecutionsOlderThan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates cleanup cutoff to repository", async () => {
    const cutoff = new Date("2026-04-12T00:00:00.000Z")
    cleanupOldWebhookExecutions.mockResolvedValueOnce(3)

    await expect(cleanupWebhookExecutionsOlderThan(cutoff)).resolves.toBe(3)
    expect(cleanupOldWebhookExecutions).toHaveBeenCalledWith(cutoff)
  })
})
