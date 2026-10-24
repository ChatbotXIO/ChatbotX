import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// "Is anyone listening" cache for events whose conditions are narrowed by the
// evaluator (shopping cart sent / user asked about a product). Those events
// carry no sourceId, so a workspace whose only conditions are pinned to a
// product must still be admitted — otherwise the event is never enqueued and
// the evaluator never runs. Exercised through both real caches (trigger and
// webhook), mocking only the database and Redis.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  triggerFindMany: vi.fn(),
  webhookFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      triggerModel: { findMany: mocks.triggerFindMany },
      webhookModel: { findMany: mocks.webhookFindMany },
    },
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: () => ({
    get: async () => null,
    setex: async () => "OK",
    del: async () => 1,
  }),
}))

const { hasActiveTriggers } = await import("../src/trigger/cache")
const { hasActiveWebhooks } = await import("../src/webhook/cache")

const withConditions = (
  conditions: Array<{ type: string; sourceId: string | null }>,
) => [{ conditions }]

let workspaceCounter = 0
/** A fresh workspace id per case, so the in-memory cache never carries over. */
const nextWorkspaceId = () => `ws-${++workspaceCounter}`

const caches = [
  ["trigger", hasActiveTriggers, mocks.triggerFindMany],
  ["webhook", hasActiveWebhooks, mocks.webhookFindMany],
] as const

describe.each(
  caches,
)("%s cache — evaluator-filtered events", (_name, hasActive, findMany) => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    ["shoppingCartSent", "any product", null],
    ["shoppingCartSent", "a specific product only", "product-1"],
    ["userAskedAboutProduct", "any product", null],
    ["userAskedAboutProduct", "a specific product only", "product-1"],
    ["productOrdered", "a specific product only", "product-1"],
    ["productAddedToCart", "a specific product only", "product-1"],
    ["productRemovedFromCart", "a specific product only", "product-1"],
    ["categoryAddedToCart", "a specific category only", "category-1"],
  ] as const)("admits %s with a condition for %s, without an event sourceId", async (type, _label, sourceId) => {
    findMany.mockResolvedValue(withConditions([{ type, sourceId }]))

    expect(await hasActive(nextWorkspaceId(), [type])).toBe(true)
  })

  test("admits a mix of any-product and specific-product conditions", async () => {
    findMany.mockResolvedValue(
      withConditions([
        { type: "shoppingCartSent", sourceId: "product-1" },
        { type: "shoppingCartSent", sourceId: null },
      ]),
    )

    expect(await hasActive(nextWorkspaceId(), ["shoppingCartSent"])).toBe(true)
  })

  test("does not admit when no condition of that type exists", async () => {
    findMany.mockResolvedValue(
      withConditions([{ type: "userAskedAboutProduct", sourceId: null }]),
    )

    expect(await hasActive(nextWorkspaceId(), ["shoppingCartSent"])).toBe(false)
  })

  test("still requires a matching sourceId for events filtered by it", async () => {
    findMany.mockResolvedValue(
      withConditions([{ type: "tagApplied", sourceId: "tag-1" }]),
    )
    const workspaceId = nextWorkspaceId()

    expect(await hasActive(workspaceId, ["tagApplied"])).toBe(false)
    expect(await hasActive(workspaceId, ["tagApplied"], "tag-2")).toBe(false)
    expect(await hasActive(workspaceId, ["tagApplied"], "tag-1")).toBe(true)
  })
})
