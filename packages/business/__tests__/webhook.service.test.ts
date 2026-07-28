import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const insertBuilder = {
    values: vi.fn(() => insertBuilder),
    returning: vi.fn(async () => [{ id: "webhook-1" }]),
  }
  const conditionInsertBuilder = {
    values: vi.fn(async () => undefined),
  }
  const tx = {
    insert: vi.fn(),
  }
  const deleteBuilder = {
    where: vi.fn(() => deleteBuilder),
    returning: vi.fn(async () => [{ id: "webhook-1" }]),
  }

  return {
    webhookModel: { workspaceId: "workspaceId-column", id: "id-column" },
    conditionModel: {},
    insertBuilder,
    conditionInsertBuilder,
    deleteBuilder,
    tx,
    count: vi.fn(async () => 0),
    transaction: vi.fn(
      async (fn: (tx: typeof tx) => Promise<unknown>) => await fn(tx),
    ),
    deleteFn: vi.fn(() => deleteBuilder),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    $count: mocks.count,
    transaction: mocks.transaction,
    delete: mocks.deleteFn,
  },
  eq: vi.fn(() => "eq"),
  and: vi.fn(() => "and"),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  webhookModel: mocks.webhookModel,
  conditionModel: mocks.conditionModel,
}))

vi.mock("@chatbotx.io/events", () => ({
  updateWebhookCache: vi.fn(async () => undefined),
  removeWebhookCache: vi.fn(async () => undefined),
}))

const distributedLock = {
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  ),
}
vi.mock("@chatbotx.io/redis", () => ({ distributedLock }))

let idCounter = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => `generated-id-${++idCounter}`),
}))

const assertPublicUrl = vi.fn(async () => undefined)
vi.mock("../src/net/ssrf-guard", () => ({ assertPublicUrl }))

const { updateWebhookCache, removeWebhookCache } = await import(
  "@chatbotx.io/events"
)
const { webhookService, MAX_WEBHOOKS_PER_WORKSPACE } = await import(
  "../src/webhook/service"
)

const CONDITIONS = [{ type: "newContact" }]
const MAX_ITEMS_REACHED_PATTERN = /maximum/i

beforeEach(() => {
  vi.clearAllMocks()
  idCounter = 0
  mocks.count.mockResolvedValue(0)
  mocks.insertBuilder.returning.mockResolvedValue([{ id: "webhook-1" }])
  mocks.deleteBuilder.returning.mockResolvedValue([{ id: "webhook-1" }])
  mocks.tx.insert
    .mockImplementationOnce(() => mocks.insertBuilder)
    .mockImplementationOnce(() => mocks.conditionInsertBuilder)
  assertPublicUrl.mockResolvedValue(undefined)
  distributedLock.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
})

describe("webhookService.register", () => {
  test("rejects a non-public URL via the SSRF guard before writing anything", async () => {
    assertPublicUrl.mockRejectedValueOnce(
      new Error(
        "[ssrf-guard] Webhook URL is not allowed: http://127.0.0.1/hook",
      ),
    )

    await expect(
      webhookService.register({
        workspaceId: "workspace-1",
        name: "n8n trigger",
        url: "http://127.0.0.1/hook",
        conditions: CONDITIONS,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("not allowed"),
      code: "invalidRequestData",
      httpStatusCode: 422,
    })

    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("throws once the workspace has reached the cap", async () => {
    mocks.count.mockResolvedValue(MAX_WEBHOOKS_PER_WORKSPACE)

    await expect(
      webhookService.register({
        workspaceId: "workspace-1",
        name: "n8n trigger",
        url: "https://n8n.example.com/webhook/abc",
        conditions: CONDITIONS,
      }),
    ).rejects.toThrow(MAX_ITEMS_REACHED_PATTERN)

    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("creates the webhook and its conditions, then refreshes the cache", async () => {
    const result = await webhookService.register({
      workspaceId: "workspace-1",
      name: "n8n trigger",
      url: "https://n8n.example.com/webhook/abc",
      conditions: [
        { type: "newContact" },
        { type: "tagApplied", sourceId: "tag-1" },
      ],
    })

    expect(result).toEqual({ id: "webhook-1" })
    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        name: "n8n trigger",
        url: "https://n8n.example.com/webhook/abc",
      }),
    )
    expect(mocks.conditionInsertBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({
        webhookId: "webhook-1",
        type: "newContact",
        sourceId: null,
        operator: null,
        value: null,
      }),
      expect.objectContaining({
        webhookId: "webhook-1",
        type: "tagApplied",
        sourceId: "tag-1",
      }),
    ])
    expect(updateWebhookCache).toHaveBeenCalledWith("workspace-1")
  })
})

describe("webhookService.unregister", () => {
  test("deletes the webhook scoped to the workspace and refreshes the cache", async () => {
    await webhookService.unregister({
      workspaceId: "workspace-1",
      id: "webhook-1",
    })

    expect(mocks.deleteFn).toHaveBeenCalledWith(mocks.webhookModel)
    expect(removeWebhookCache).toHaveBeenCalledWith("workspace-1")
  })

  test("throws not-found when no row matches the workspace", async () => {
    mocks.deleteBuilder.returning.mockResolvedValueOnce([])

    await expect(
      webhookService.unregister({ workspaceId: "workspace-1", id: "missing" }),
    ).rejects.toThrow("Webhook not found")

    expect(removeWebhookCache).not.toHaveBeenCalled()
  })
})
