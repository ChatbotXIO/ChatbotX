import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  contactCustomFieldFindFirst,
  executeWebhook,
  webhookFindMany,
  workspaceFind,
} = vi.hoisted(() => ({
  contactCustomFieldFindFirst: vi.fn(),
  executeWebhook: vi.fn(),
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

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
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

describe("WebhookMatcherService datetime events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contactCustomFieldFindFirst.mockRejectedValue(
      new Error("datetime should not be re-evaluated by webhook matcher"),
    )
    executeWebhook.mockResolvedValue(undefined)
    webhookFindMany.mockResolvedValue([webhook])
    workspaceFind.mockResolvedValue({ id: "workspace-1", timezone: "UTC" })
  })

  test("executes datetime webhook when scanner already matched the source id", async () => {
    const matcher = new WebhookMatcherService()

    await matcher.findAndExecuteWebhooks({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
      eventData: { sourceId: "cf-1" },
      timestamp: new Date("2026-07-11T00:00:00.000Z"),
    })

    expect(contactCustomFieldFindFirst).not.toHaveBeenCalled()
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook,
      eventData: expect.objectContaining({
        eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
        eventData: { sourceId: "cf-1" },
      }),
    })
  })

  test("does not execute datetime webhook for a different source id", async () => {
    const matcher = new WebhookMatcherService()

    await matcher.findAndExecuteWebhooks({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
      eventData: { sourceId: "cf-other" },
      timestamp: new Date("2026-07-11T00:00:00.000Z"),
    })

    expect(contactCustomFieldFindFirst).not.toHaveBeenCalled()
    expect(executeWebhook).not.toHaveBeenCalled()
  })

  test("continues executing matched webhooks when one delivery fails", async () => {
    executeWebhook
      .mockRejectedValueOnce(new Error("first endpoint failed"))
      .mockResolvedValueOnce(undefined)
    webhookFindMany.mockResolvedValue([webhook, secondWebhook])
    const matcher = new WebhookMatcherService()

    await expect(
      matcher.findAndExecuteWebhooks({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
        eventData: { sourceId: "cf-1" },
        timestamp: new Date("2026-07-11T00:00:00.000Z"),
      }),
    ).resolves.toBeUndefined()

    expect(executeWebhook).toHaveBeenCalledTimes(2)
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook,
      eventData: expect.objectContaining({
        eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
      }),
    })
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook: secondWebhook,
      eventData: expect.objectContaining({
        eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
      }),
    })
  })
})
