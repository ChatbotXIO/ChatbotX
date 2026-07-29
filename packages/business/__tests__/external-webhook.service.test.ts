import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const insertBuilder = {
    values: vi.fn(() => insertBuilder),
    onConflictDoNothing: vi.fn(() => insertBuilder),
    returning: vi.fn(async () => [{ id: "external-webhook-1" }]),
  }
  const deleteBuilder = {
    where: vi.fn(() => deleteBuilder),
    returning: vi.fn(async () => [{ id: "external-webhook-1" }]),
  }

  return {
    externalWebhookModel: {
      id: "id-column",
      workspaceId: "workspaceId-column",
    },
    insertBuilder,
    deleteBuilder,
    findFirst: vi.fn(async () => undefined as unknown),
    count: vi.fn(async () => 0),
    insertFn: vi.fn(() => insertBuilder),
    deleteFn: vi.fn(() => deleteBuilder),
    findOrFail: vi.fn(async () => ({ id: "external-webhook-1" })),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { externalWebhookModel: { findFirst: mocks.findFirst } },
    $count: mocks.count,
    insert: mocks.insertFn,
    delete: mocks.deleteFn,
  },
  eq: vi.fn(() => "eq"),
  and: vi.fn(() => "and"),
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  externalWebhookModel: mocks.externalWebhookModel,
}))

let idCounter = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => `generated-id-${++idCounter}`),
}))

const assertPublicUrl = vi.fn(async () => undefined)
vi.mock("../src/net/ssrf-guard", () => ({ assertPublicUrl }))

const { externalWebhookService } = await import(
  "../src/external-webhook/service"
)

// Not exported by the service module; mirrors the private constant there.
const MAX_WEBHOOKS_PER_WORKSPACE = 50
const MAX_ITEMS_REACHED_PATTERN = /maximum/i

const REGISTER_INPUT = {
  workspaceId: "workspace-1",
  provider: "n8n",
  event: "newContact",
  url: "https://n8n.example.com/webhook/abc",
}

beforeEach(() => {
  vi.clearAllMocks()
  idCounter = 0
  mocks.findFirst.mockResolvedValue(undefined)
  mocks.count.mockResolvedValue(0)
  mocks.insertBuilder.returning.mockResolvedValue([
    { id: "external-webhook-1" },
  ])
  mocks.deleteBuilder.returning.mockResolvedValue([
    { id: "external-webhook-1" },
  ])
  assertPublicUrl.mockResolvedValue(undefined)
})

describe("externalWebhookService.register", () => {
  test("rejects a non-public URL as a 422 ChatbotXException before touching the DB", async () => {
    assertPublicUrl.mockRejectedValueOnce(
      new Error(
        "[ssrf-guard] Webhook URL is not allowed: http://127.0.0.1/hook",
      ),
    )

    await expect(
      externalWebhookService.register({
        ...REGISTER_INPUT,
        url: "http://127.0.0.1/hook",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("not allowed"),
      code: "invalidRequestData",
      httpStatusCode: 422,
    })

    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.insertFn).not.toHaveBeenCalled()
  })

  test("returns the existing row instead of inserting when already registered", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "existing-webhook" })

    const result = await externalWebhookService.register(REGISTER_INPUT)

    expect(result).toEqual({ id: "existing-webhook" })
    expect(mocks.insertFn).not.toHaveBeenCalled()
  })

  test("throws once the workspace has reached the cap", async () => {
    mocks.count.mockResolvedValue(MAX_WEBHOOKS_PER_WORKSPACE)

    await expect(
      externalWebhookService.register(REGISTER_INPUT),
    ).rejects.toThrow(MAX_ITEMS_REACHED_PATTERN)

    expect(mocks.insertFn).not.toHaveBeenCalled()
  })

  test("creates the external webhook when under the cap", async () => {
    const result = await externalWebhookService.register(REGISTER_INPUT)

    expect(result).toEqual({ id: "external-webhook-1" })
    expect(mocks.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        provider: "n8n",
        event: "newContact",
        url: "https://n8n.example.com/webhook/abc",
      }),
    )
  })
})

describe("externalWebhookService.unregister", () => {
  test("deletes the webhook scoped to the workspace", async () => {
    await externalWebhookService.unregister({
      workspaceId: "workspace-1",
      id: "external-webhook-1",
    })

    expect(mocks.deleteFn).toHaveBeenCalledWith(mocks.externalWebhookModel)
  })

  test("throws not-found when no row matches the workspace", async () => {
    mocks.deleteBuilder.returning.mockResolvedValueOnce([])

    await expect(
      externalWebhookService.unregister({
        workspaceId: "workspace-1",
        id: "missing",
      }),
    ).rejects.toThrow("External webhook not found")
  })
})
