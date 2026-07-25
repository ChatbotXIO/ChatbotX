import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  buildPayload,
  contactCustomFieldFindFirst,
  executeWebhook,
  loggerError,
  webhookFindMany,
  workspaceFind,
} = vi.hoisted(() => ({
  buildPayload: vi.fn(),
  contactCustomFieldFindFirst: vi.fn(),
  executeWebhook: vi.fn(),
  loggerError: vi.fn(),
  webhookFindMany: vi.fn(),
  workspaceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactCustomFieldModel: {
        findFirst: contactCustomFieldFindFirst,
      },
      webhookModel: {
        findMany: webhookFindMany,
      },
    },
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    find: workspaceFind,
  },
}))

vi.mock("../src/webhook/services/webhook-executor.service", () => ({
  WebhookExecutor: class {
    execute = executeWebhook
  },
}))

vi.mock("../src/webhook/services/webhook-payload.builder", () => ({
  buildWebhookPayload: buildPayload,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: loggerError,
  },
}))

const { WebhookMatcherService } = await import(
  "../src/webhook/services/webhook-matcher.service"
)

const datetimeCondition = {
  id: "condition-1",
  type: triggerEventTypes.enum.dateTimeBasedTrigger,
  sourceId: "cf-1",
  value: {
    triggerType: "after",
    timeValue: 2,
    timeType: "days",
  },
}

const webhook = {
  id: "webhook-1",
  workspaceId: "workspace-1",
  active: true,
  conditions: [datetimeCondition],
}

const secondWebhook = {
  id: "webhook-2",
  workspaceId: "workspace-1",
  active: true,
  conditions: [datetimeCondition],
}

// Custom-field conditions are re-evaluated against the database, so this is the
// fixture that can make condition evaluation itself fail.
const customFieldWebhook = {
  id: "webhook-cf",
  workspaceId: "workspace-1",
  active: true,
  conditions: [
    {
      id: "condition-cf",
      type: triggerEventTypes.enum.customFieldValueChanged,
      sourceId: "cf-1",
      operator: "is",
      value: "Pro",
    },
  ],
}

const datetimeEvent = {
  workspaceId: "workspace-1",
  contactId: "contact-1",
  eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
  eventData: { sourceId: "cf-1" },
  timestamp: new Date("2026-07-11T00:00:00.000Z"),
}

const datetimePayload = { event: "datetime_based_trigger", sourceId: "cf-1" }

describe("WebhookMatcherService datetime events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contactCustomFieldFindFirst.mockRejectedValue(
      new Error("datetime should not be re-evaluated by webhook matcher"),
    )
    buildPayload.mockResolvedValue(datetimePayload)
    executeWebhook.mockResolvedValue(undefined)
    webhookFindMany.mockResolvedValue([webhook])
    workspaceFind.mockResolvedValue({ id: "workspace-1", timezone: "UTC" })
  })

  test("executes datetime webhook when scanner already matched the source id", async () => {
    const matcher = new WebhookMatcherService()

    await matcher.findAndExecuteWebhooks(datetimeEvent)

    expect(contactCustomFieldFindFirst).not.toHaveBeenCalled()
    expect(buildPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
        eventData: { sourceId: "cf-1" },
      }),
    )
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook,
      payload: datetimePayload,
    })
  })

  test("does not execute datetime webhook for a different source id", async () => {
    const matcher = new WebhookMatcherService()

    await matcher.findAndExecuteWebhooks({
      ...datetimeEvent,
      eventData: { sourceId: "cf-other" },
    })

    expect(contactCustomFieldFindFirst).not.toHaveBeenCalled()
    expect(buildPayload).not.toHaveBeenCalled()
    expect(executeWebhook).not.toHaveBeenCalled()
  })

  test("continues executing matched webhooks when one delivery fails", async () => {
    executeWebhook
      .mockRejectedValueOnce(new Error("first endpoint failed"))
      .mockResolvedValueOnce(undefined)
    webhookFindMany.mockResolvedValue([webhook, secondWebhook])
    const matcher = new WebhookMatcherService()

    await expect(
      matcher.findAndExecuteWebhooks(datetimeEvent),
    ).resolves.toBeUndefined()

    expect(executeWebhook).toHaveBeenCalledTimes(2)
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook,
      payload: datetimePayload,
    })
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook: secondWebhook,
      payload: datetimePayload,
    })
  })

  test("builds a matched event payload once for multiple webhook deliveries", async () => {
    webhookFindMany.mockResolvedValue([webhook, secondWebhook])
    const matcher = new WebhookMatcherService()

    await matcher.findAndExecuteWebhooks(datetimeEvent)

    expect(buildPayload).toHaveBeenCalledTimes(1)
    expect(executeWebhook).toHaveBeenCalledTimes(2)
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook,
      payload: datetimePayload,
    })
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook: secondWebhook,
      payload: datetimePayload,
    })
  })

  // One payload feeds the whole fan-out, so swallowing a build failure would
  // drop every delivery at once with nothing left to retry. Failing the job is
  // safe here precisely because the build runs before the first delivery:
  // nothing has been sent yet, so the queue retry cannot duplicate a webhook.
  test("fails the job without delivering when the payload cannot be built", async () => {
    buildPayload.mockRejectedValue(new Error("contact lookup failed"))
    webhookFindMany.mockResolvedValue([webhook, secondWebhook])
    const matcher = new WebhookMatcherService()

    await expect(matcher.findAndExecuteWebhooks(datetimeEvent)).rejects.toThrow(
      "contact lookup failed",
    )

    expect(executeWebhook).not.toHaveBeenCalled()
  })

  // The opposite call: a condition that cannot be evaluated must NOT fail the
  // job, because matched webhooks are delivered after this step and a retry
  // would send them twice. It must still be visible in the logs.
  test("logs and skips a webhook whose conditions cannot be evaluated", async () => {
    contactCustomFieldFindFirst.mockRejectedValue(
      new Error("custom field lookup failed"),
    )
    webhookFindMany.mockResolvedValue([customFieldWebhook])
    const matcher = new WebhookMatcherService()

    await expect(
      matcher.findAndExecuteWebhooks({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        eventType: triggerEventTypes.enum.customFieldValueChanged,
        eventData: { customFieldId: "cf-other", newValue: "Pro" },
        timestamp: new Date("2026-07-11T00:00:00.000Z"),
      }),
    ).resolves.toBeUndefined()

    expect(loggerError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining("webhook-cf"),
    )
    expect(buildPayload).not.toHaveBeenCalled()
    expect(executeWebhook).not.toHaveBeenCalled()
  })
})
