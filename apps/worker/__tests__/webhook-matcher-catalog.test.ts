import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// A webhook fires when ANY of its conditions matches. A condition for another
// event must not count, otherwise a simple "any product" condition of one event
// would override the product a sibling condition for the delivered event is
// pinned to.
// ---------------------------------------------------------------------------

const {
  buildPayload,
  executeWebhook,
  listActiveWithConditions,
  workspaceFind,
} = vi.hoisted(() => ({
  buildPayload: vi.fn(),
  executeWebhook: vi.fn(),
  listActiveWithConditions: vi.fn(),
  workspaceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { find: workspaceFind },
  webhookService: { listActiveWithConditions },
  contactCustomFieldService: { findValue: vi.fn() },
  customFieldService: { findBy: vi.fn() },
}))

vi.mock("../src/webhook/services/webhook-executor.service", () => ({
  WebhookExecutor: class {
    execute = executeWebhook
  },
}))

vi.mock("../src/webhook/services/webhook-payload.builder", () => ({
  buildWebhookPayload: buildPayload,
}))

vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn() } }))

const { WebhookMatcherService } = await import(
  "../src/webhook/services/webhook-matcher.service"
)

const condition = (type: string, sourceId: string | null) => ({
  id: `${type}-${sourceId}`,
  type,
  sourceId,
  operator: null,
  value: null,
})

const webhookWith = (
  id: string,
  conditions: ReturnType<typeof condition>[],
) => ({
  id,
  workspaceId: "workspace-1",
  active: true,
  conditions,
})

const reference = (productId: string | null) => ({
  catalogReference: {
    source: "metaCatalog",
    catalogId: "cat-1",
    retailerId: `sku-${productId}`,
  },
  product: productId
    ? { productId, name: "n", imageUrl: null, price: 1, currency: "USD" }
    : null,
})

const cartEvent = (productId: string) => ({
  workspaceId: "workspace-1",
  contactId: "contact-1",
  eventType: triggerEventTypes.enum.shoppingCartSent,
  eventData: { products: [{ ...reference(productId), quantity: 1 }] },
  timestamp: new Date("2026-10-14T00:00:00.000Z"),
})

describe("WebhookMatcherService catalog events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildPayload.mockResolvedValue({ event: "shopping_cart_sent" })
    executeWebhook.mockResolvedValue(undefined)
    workspaceFind.mockResolvedValue({ id: "workspace-1", timezone: "UTC" })
  })

  test("a sibling condition for another event cannot override the product filter", async () => {
    const mixed = webhookWith("mixed", [
      condition(triggerEventTypes.enum.shoppingCartSent, "101"),
      condition(triggerEventTypes.enum.userAskedAboutProduct, null),
    ])
    listActiveWithConditions.mockResolvedValue([mixed])

    await new WebhookMatcherService().findAndExecuteWebhooks(cartEvent("202"))

    expect(executeWebhook).not.toHaveBeenCalled()
  })

  test("the same webhook still fires for a cart that contains its product", async () => {
    const mixed = webhookWith("mixed", [
      condition(triggerEventTypes.enum.shoppingCartSent, "101"),
      condition(triggerEventTypes.enum.userAskedAboutProduct, null),
    ])
    listActiveWithConditions.mockResolvedValue([mixed])

    await new WebhookMatcherService().findAndExecuteWebhooks(cartEvent("101"))

    expect(executeWebhook).toHaveBeenCalledTimes(1)
    expect(executeWebhook).toHaveBeenCalledWith({
      webhook: mixed,
      payload: { event: "shopping_cart_sent" },
    })
  })

  test("a webhook with an any-product condition for the event fires for any cart", async () => {
    const anyProduct = webhookWith("any", [
      condition(triggerEventTypes.enum.shoppingCartSent, null),
    ])
    listActiveWithConditions.mockResolvedValue([anyProduct])

    await new WebhookMatcherService().findAndExecuteWebhooks(cartEvent("202"))

    expect(executeWebhook).toHaveBeenCalledTimes(1)
  })
})
