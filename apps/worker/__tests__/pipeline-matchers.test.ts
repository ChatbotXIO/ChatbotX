import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  executeWebhook: vi.fn(),
  listActiveWebhooks: vi.fn(),
  listActiveTriggers: vi.fn(),
  workspaceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { find: mocks.workspaceFind },
  webhookService: { listActiveWithConditions: mocks.listActiveWebhooks },
  triggerService: { listActiveWithConditions: mocks.listActiveTriggers },
  contactCustomFieldService: { findValue: vi.fn() },
  customFieldService: { findBy: vi.fn() },
}))
vi.mock("../src/webhook/services/webhook-executor.service", () => ({
  WebhookExecutor: class {
    execute = mocks.executeWebhook
  },
}))
vi.mock("../src/webhook/services/webhook-payload.builder", () => ({
  buildWebhookPayload: vi
    .fn()
    .mockResolvedValue({ event: "pipeline_item_created" }),
}))
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn() } }))

const { WebhookMatcherService } = await import(
  "../src/webhook/services/webhook-matcher.service"
)
const { TriggerMatcherService } = await import(
  "../src/trigger/services/trigger-matcher.service"
)

const TYPE = triggerEventTypes.enum.pipelineItemCreated

const condition = (sourceId: string | null) => ({
  id: "c-1",
  type: TYPE,
  sourceId,
  operator: null,
  value: null,
})

const owner = (conditions: ReturnType<typeof condition>[]) => ({
  id: "owner-1",
  workspaceId: "ws-1",
  active: true,
  conditions,
})

const event = {
  workspaceId: "ws-1",
  contactId: "contact-1",
  eventType: TYPE,
  eventData: { sourceId: "p-1", pipelineId: "p-1", stageId: "s-1" },
  timestamp: new Date("2026-10-25T00:00:00.000Z"),
}

describe("pipeline item conditions through the matchers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.workspaceFind.mockResolvedValue({ id: "ws-1", timezone: "UTC" })
    mocks.executeWebhook.mockResolvedValue(undefined)
  })

  test.each([
    ["an unpinned (any pipeline) condition", null, 1],
    ["a condition pinned to this pipeline", "p-1", 1],
    ["a condition pinned to another pipeline", "p-9", 0],
  ])("webhook: %s", async (_name, sourceId, expectedCalls) => {
    mocks.listActiveWebhooks.mockResolvedValue([owner([condition(sourceId)])])

    await new WebhookMatcherService().findAndExecuteWebhooks(event)

    expect(mocks.executeWebhook).toHaveBeenCalledTimes(expectedCalls)
  })

  test.each([
    ["an unpinned (any pipeline) condition", null, 1],
    ["a condition pinned to this pipeline", "p-1", 1],
    ["a condition pinned to another pipeline", "p-9", 0],
  ])("trigger: %s", async (_name, sourceId, expectedMatches) => {
    mocks.listActiveTriggers.mockResolvedValue([owner([condition(sourceId)])])

    const matches = await new TriggerMatcherService().findMatchingTriggers(
      event,
    )

    expect(matches).toHaveLength(expectedMatches)
  })

  test("an unpinned tag condition still does not match a tag event (unchanged behaviour)", async () => {
    mocks.listActiveTriggers.mockResolvedValue([
      owner([{ ...condition(null), type: triggerEventTypes.enum.tagApplied }]),
    ])

    const matches = await new TriggerMatcherService().findMatchingTriggers({
      ...event,
      eventType: triggerEventTypes.enum.tagApplied,
      eventData: { sourceId: "tag-1", tagId: "tag-1" },
    })

    expect(matches).toHaveLength(0)
  })
})
