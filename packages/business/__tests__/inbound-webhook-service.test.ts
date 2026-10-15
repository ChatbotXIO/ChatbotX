import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countInboundWebhooks: vi.fn(),
  insertInboundWebhook: vi.fn(),
  updateInboundWebhook: vi.fn(),
  findInboundWebhookById: vi.fn(),
  findInboundWebhookIntakeByToken: vi.fn(),
  deleteInboundWebhooks: vi.fn(),
  insertInboundWebhookRequest: vi.fn(),
  failAbandonedInboundWebhookRequests: vi.fn(),
  claimInboundWebhookRequest: vi.fn(),
  checkpointInboundWebhookRequest: vi.fn(),
  releaseInboundWebhookRequest: vi.fn(),
  completeInboundWebhookRequest: vi.fn(),
  listInboundWebhookRequestsPaginated: vi.fn(),
  listInboundWebhooksPaginated: vi.fn(),
  listStaleInboundWebhookRequests: vi.fn(),
  findInboundWebhookRequest: vi.fn(),
  purgeInboundWebhookRequests: vi.fn(),
  actionReferencesExist: vi.fn(),
  findCustomFields: vi.fn(),
  validateConfig: vi.fn(),
  resolveEffectiveChannel: vi.fn(),
  runExclusive: vi.fn(),
  withCache: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  audit: vi.fn(),
  loadExtractionContext: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  checkpointInboundWebhookRequest: mocks.checkpointInboundWebhookRequest,
  claimInboundWebhookRequest: mocks.claimInboundWebhookRequest,
  completeInboundWebhookRequest: mocks.completeInboundWebhookRequest,
  countInboundWebhooks: mocks.countInboundWebhooks,
  deleteInboundWebhooks: mocks.deleteInboundWebhooks,
  failAbandonedInboundWebhookRequests:
    mocks.failAbandonedInboundWebhookRequests,
  findInboundWebhookById: mocks.findInboundWebhookById,
  findInboundWebhookIntakeByToken: mocks.findInboundWebhookIntakeByToken,
  findInboundWebhookRequest: mocks.findInboundWebhookRequest,
  insertInboundWebhook: mocks.insertInboundWebhook,
  insertInboundWebhookRequest: mocks.insertInboundWebhookRequest,
  listInboundWebhookRequestsPaginated:
    mocks.listInboundWebhookRequestsPaginated,
  listInboundWebhooksPaginated: mocks.listInboundWebhooksPaginated,
  listStaleInboundWebhookRequests: mocks.listStaleInboundWebhookRequests,
  purgeInboundWebhookRequests: mocks.purgeInboundWebhookRequests,
  releaseInboundWebhookRequest: mocks.releaseInboundWebhookRequest,
  updateInboundWebhook: mocks.updateInboundWebhook,
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/redis")>()
  return {
    ...actual,
    distributedLock: { runExclusive: mocks.runExclusive },
    invalidateCacheByTags: mocks.invalidateCacheByTags,
    withCache: mocks.withCache,
  }
})
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: mocks.audit }))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findManyByIds: mocks.findCustomFields },
}))
vi.mock("../src/inbound-webhook/action-references", () => ({
  actionReferencesExistInWorkspace: mocks.actionReferencesExist,
}))
vi.mock("../src/inbound-webhook/effective-channel", () => ({
  validateInboundWebhookConfig: mocks.validateConfig,
  resolveEffectiveChannel: mocks.resolveEffectiveChannel,
}))
vi.mock("../src/inbound-webhook/extraction-context", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/inbound-webhook/extraction-context")
    >()
  return { ...actual, loadExtractionContext: mocks.loadExtractionContext }
})

const { inboundWebhookService } = await import("../src/inbound-webhook/service")

const WEBHOOK_TOKEN = /^iwh_[A-Za-z0-9_-]{43}$/
const TOKEN_PREFIX = /^iwh_/
const TOKEN_CACHE_KEY = /^inbound-webhooks:intake:[0-9a-f]{64}$/
const UUID = /^[0-9a-f-]{36}$/

const webhook = {
  id: "w-1",
  workspaceId: "ws-1",
  name: "Orders",
  active: false,
  token: "iwh_token",
  inboxResolution: { mode: "inbox" as const, inboxId: "5" },
  identifiers: [{ kind: "phone" as const, jsonPath: "$.phone" }],
  fieldMappings: [],
  actions: [],
  sampleJson: null,
}
const config = {
  inboxResolution: webhook.inboxResolution,
  identifiers: webhook.identifiers,
  fieldMappings: [],
  actions: [],
  sampleJson: { a: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runExclusive.mockImplementation(
    ({ fn }: { fn: () => Promise<unknown> }) => fn(),
  )
  mocks.withCache.mockImplementation(
    (_key: string, fn: () => Promise<unknown>) => fn(),
  )
  mocks.countInboundWebhooks.mockResolvedValue(0)
  mocks.insertInboundWebhook.mockImplementation((values: object) =>
    Promise.resolve({ id: "w-new", ...values }),
  )
  mocks.findInboundWebhookById.mockResolvedValue(webhook)
  mocks.updateInboundWebhook.mockImplementation(({ set }: { set: object }) =>
    Promise.resolve({ ...webhook, ...set }),
  )
  mocks.validateConfig.mockResolvedValue([])
  mocks.findCustomFields.mockResolvedValue([])
  mocks.actionReferencesExist.mockResolvedValue(true)
  mocks.insertInboundWebhookRequest.mockResolvedValue({ id: "r-1" })
  mocks.deleteInboundWebhooks.mockResolvedValue([])
})

describe("create", () => {
  test("inserts an inactive-by-default webhook with explicit values under a lock", async () => {
    const created = await inboundWebhookService.create({
      workspaceId: "ws-1",
      name: "Orders",
    })

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "inbound-webhook:ws-1",
        timeoutInSeconds: 10,
        retryTimeoutInSeconds: 10,
      }),
    )
    const [values] = mocks.insertInboundWebhook.mock.calls[0] ?? []
    expect(values).toMatchObject({
      workspaceId: "ws-1",
      name: "Orders",
      inboxResolution: null,
      identifiers: [],
      fieldMappings: [],
      actions: [],
      sampleJson: null,
    })
    expect(values).not.toHaveProperty("active")
    expect(values.token).toMatch(WEBHOOK_TOKEN)
    expect(created.id).toBe("w-new")
    expect(mocks.audit).toHaveBeenCalled()
  })

  test("mints a different token every time", async () => {
    await inboundWebhookService.create({ workspaceId: "ws-1", name: "A" })
    await inboundWebhookService.create({ workspaceId: "ws-1", name: "B" })

    const [first, second] = mocks.insertInboundWebhook.mock.calls.map(
      ([values]) => values.token,
    )
    expect(first).not.toBe(second)
  })

  test("refuses beyond the per-workspace limit", async () => {
    mocks.countInboundWebhooks.mockResolvedValue(100)

    await expect(
      inboundWebhookService.create({ workspaceId: "ws-1", name: "x" }),
    ).rejects.toMatchObject({ message: "validation.maxItemsReached" })
    expect(mocks.insertInboundWebhook).not.toHaveBeenCalled()
  })
})

describe("findByToken", () => {
  const intake = {
    id: "w-1",
    workspaceId: "ws-1",
    active: true,
    isConfigured: true,
  }

  test("is cached briefly and tagged by webhook id so a change invalidates it", async () => {
    mocks.findInboundWebhookIntakeByToken.mockResolvedValue(intake)

    await inboundWebhookService.findByToken("iwh_token")

    const [key, , options] = mocks.withCache.mock.calls[0] ?? []
    expect(key).toMatch(TOKEN_CACHE_KEY)
    expect(key).not.toContain("iwh_token")
    expect(options.ttl).toBe(10)
    expect(options.dynamicTags(intake)).toEqual(["inbound-webhooks:w-1"])
    expect(options.dynamicTags(null)).toBeUndefined()
  })

  test("what is cached is the four-field intake, never the config or the sample", async () => {
    mocks.findInboundWebhookIntakeByToken.mockResolvedValue(intake)
    mocks.withCache.mockImplementation((_key, fn) => fn())

    const result = await inboundWebhookService.findByToken("iwh_token")

    expect(result).toEqual(intake)
    expect(Object.keys(result ?? {}).sort()).toEqual([
      "active",
      "id",
      "isConfigured",
      "workspaceId",
    ])
  })
})

describe("update", () => {
  test("validates the whole config, mappings included, whether or not the webhook is active", async () => {
    await inboundWebhookService.update({
      workspaceId: "ws-1",
      id: "w-1",
      ...config,
    })
    mocks.findInboundWebhookById.mockResolvedValue({ ...webhook, active: true })
    await inboundWebhookService.update({
      workspaceId: "ws-1",
      id: "w-1",
      ...config,
    })

    expect(mocks.validateConfig).toHaveBeenCalledTimes(2)
    for (const [input] of mocks.validateConfig.mock.calls) {
      expect(input).toMatchObject({
        inboxResolution: config.inboxResolution,
        identifiers: config.identifiers,
        fieldMappings: config.fieldMappings,
      })
    }
  })

  test("turns the first config issue into a field validation error", async () => {
    mocks.validateConfig.mockResolvedValue([
      { field: "identifiers", code: "identifierRequired" },
    ])

    await expect(
      inboundWebhookService.update({
        workspaceId: "ws-1",
        id: "w-1",
        ...config,
      }),
    ).rejects.toMatchObject({
      field: "identifiers",
      message: "validation.inboundWebhook.identifierRequired",
    })
    expect(mocks.updateInboundWebhook).not.toHaveBeenCalled()
  })

  test("rejects a mapped custom field that does not exist in the workspace", async () => {
    mocks.findCustomFields.mockResolvedValue([])

    await expect(
      inboundWebhookService.update({
        workspaceId: "ws-1",
        id: "w-1",
        ...config,
        fieldMappings: [{ jsonPath: "$.a", target: "100" }],
      }),
    ).rejects.toMatchObject({
      field: "fieldMappings",
      message: "validation.inboundWebhook.unknownFieldTarget",
    })
    expect(mocks.findCustomFields).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["100"],
    })
  })

  test("rejects a custom-field target that is not an id, without querying", async () => {
    await expect(
      inboundWebhookService.update({
        workspaceId: "ws-1",
        id: "w-1",
        ...config,
        fieldMappings: [{ jsonPath: "$.a", target: "not-an-id" }],
      }),
    ).rejects.toMatchObject({ field: "fieldMappings" })
    expect(mocks.findCustomFields).not.toHaveBeenCalled()
  })

  test("accepts system-field and gender targets without a custom-field lookup", async () => {
    await inboundWebhookService.update({
      workspaceId: "ws-1",
      id: "w-1",
      ...config,
      fieldMappings: [
        { jsonPath: "$.a", target: "first_name" },
        { jsonPath: "$.b", target: "gender" },
      ],
    })

    expect(mocks.findCustomFields).not.toHaveBeenCalled()
  })

  test("rejects actions that point at records outside the workspace", async () => {
    mocks.actionReferencesExist.mockResolvedValue(false)
    const actions = [{ type: "startAnotherFlow", flowId: "999" }]

    await expect(
      inboundWebhookService.update({
        workspaceId: "ws-1",
        id: "w-1",
        ...config,
        actions,
      }),
    ).rejects.toMatchObject({
      field: "actions",
      message: "validation.inboundWebhook.actionReferenceNotFound",
    })
    expect(mocks.actionReferencesExist).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actions,
    })
    expect(mocks.updateInboundWebhook).not.toHaveBeenCalled()
  })

  test("saves, invalidates the webhook's cache tag and audits", async () => {
    const updated = await inboundWebhookService.update({
      workspaceId: "ws-1",
      id: "w-1",
      ...config,
    })

    expect(mocks.updateInboundWebhook).toHaveBeenCalledWith({
      id: "w-1",
      workspaceId: "ws-1",
      set: config,
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "inbound-webhooks:w-1",
    ])
    expect(updated.sampleJson).toEqual({ a: 1 })
    expect(mocks.audit).toHaveBeenCalled()
  })

  test("404s for a webhook of another workspace", async () => {
    mocks.findInboundWebhookById.mockResolvedValue(null)

    await expect(
      inboundWebhookService.update({
        workspaceId: "ws-2",
        id: "w-1",
        ...config,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("config locking", () => {
  test("a config save and an activation for the same webhook share one lock key", async () => {
    await inboundWebhookService.update({
      workspaceId: "ws-1",
      id: "w-1",
      ...config,
    })
    await inboundWebhookService.updateSettings({
      workspaceId: "ws-1",
      id: "w-1",
      active: true,
    })

    const keys = mocks.runExclusive.mock.calls.map(([options]) => options.key)
    expect(keys).toEqual([
      "inbound-webhook-config-w-1",
      "inbound-webhook-config-w-1",
    ])
  })

  test("a lock that cannot be acquired fails the save instead of racing", async () => {
    mocks.runExclusive.mockRejectedValue(new Error("lock timeout"))

    await expect(
      inboundWebhookService.update({
        workspaceId: "ws-1",
        id: "w-1",
        ...config,
      }),
    ).rejects.toThrow("lock timeout")
    expect(mocks.updateInboundWebhook).not.toHaveBeenCalled()
  })
})

describe("updateSettings", () => {
  test("activating validates that the config is complete", async () => {
    await inboundWebhookService.updateSettings({
      workspaceId: "ws-1",
      id: "w-1",
      active: true,
    })

    expect(mocks.validateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMappings: webhook.fieldMappings,
      }),
    )
    expect(mocks.updateInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ set: { active: true } }),
    )
  })

  test("refuses to activate a saved webhook that has no mappings", async () => {
    mocks.validateConfig.mockResolvedValue([
      { field: "fieldMappings", code: "fieldMappingRequired" },
    ])

    await expect(
      inboundWebhookService.updateSettings({
        workspaceId: "ws-1",
        id: "w-1",
        active: true,
      }),
    ).rejects.toMatchObject({
      field: "fieldMappings",
      message: "validation.inboundWebhook.fieldMappingRequired",
    })
    expect(mocks.validateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ fieldMappings: [] }),
    )
    expect(mocks.updateInboundWebhook).not.toHaveBeenCalled()
  })

  test("refuses to activate an incomplete webhook", async () => {
    mocks.validateConfig.mockResolvedValue([
      { field: "inboxResolution", code: "inboxRequired" },
    ])

    await expect(
      inboundWebhookService.updateSettings({
        workspaceId: "ws-1",
        id: "w-1",
        active: true,
      }),
    ).rejects.toMatchObject({ field: "inboxResolution" })
    expect(mocks.updateInboundWebhook).not.toHaveBeenCalled()
  })

  test("renaming or deactivating needs no validation", async () => {
    mocks.findInboundWebhookById.mockResolvedValue({ ...webhook, active: true })

    await inboundWebhookService.updateSettings({
      workspaceId: "ws-1",
      id: "w-1",
      active: false,
      name: "New",
    })

    expect(mocks.validateConfig).not.toHaveBeenCalled()
    expect(mocks.updateInboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ set: { name: "New", active: false } }),
    )
  })

  test("with nothing to change it returns the webhook untouched", async () => {
    await expect(
      inboundWebhookService.updateSettings({ workspaceId: "ws-1", id: "w-1" }),
    ).resolves.toBe(webhook)
    expect(mocks.updateInboundWebhook).not.toHaveBeenCalled()
  })
})

describe("regenerateToken", () => {
  test("replaces the token and invalidates the cache so the old URL stops working", async () => {
    const updated = await inboundWebhookService.regenerateToken({
      workspaceId: "ws-1",
      id: "w-1",
    })

    expect(updated.token).toMatch(TOKEN_PREFIX)
    expect(updated.token).not.toBe(webhook.token)
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "inbound-webhooks:w-1",
    ])
  })
})

describe("delete", () => {
  test("invalidates only the ids that were actually deleted", async () => {
    mocks.deleteInboundWebhooks.mockResolvedValue([{ id: "w-1", token: "t" }])

    await inboundWebhookService.deleteMany({
      workspaceId: "ws-1",
      ids: ["w-1", "other-workspace"],
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "inbound-webhooks:w-1",
    ])
  })

  test("single delete 404s when nothing was removed", async () => {
    await expect(
      inboundWebhookService.delete({ workspaceId: "ws-1", id: "w-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})

describe("recordRequest", () => {
  const clientInfo = { clientIp: "203.0.113.7", userAgent: "Shopify/1.0" }
  const record = (idempotencyKey: string | null = null) =>
    inboundWebhookService.recordRequest({
      webhook: webhook as never,
      payload: { a: 1 },
      idempotencyKey,
      clientInfo,
    })

  test("stores the row and answers not-duplicate", async () => {
    const result = await record()

    expect(result).toEqual({ duplicate: false, request: { id: "r-1" } })
    expect(mocks.insertInboundWebhookRequest).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboundWebhookId: "w-1",
      idempotencyKey: null,
      clientIp: "203.0.113.7",
      userAgent: "Shopify/1.0",
      payload: { a: 1 },
    })
  })

  test("stores a missing IP and user agent as null", async () => {
    await inboundWebhookService.recordRequest({
      webhook: webhook as never,
      payload: { a: 1 },
      idempotencyKey: "k",
      clientInfo: { clientIp: null, userAgent: null },
    })

    expect(mocks.insertInboundWebhookRequest).toHaveBeenCalledWith(
      expect.objectContaining({ clientIp: null, userAgent: null }),
    )
  })

  test("a repeated idempotency key is a duplicate (the unique row decides)", async () => {
    mocks.insertInboundWebhookRequest.mockResolvedValue(null)

    await expect(record("key-1")).resolves.toEqual({ duplicate: true })
  })

  test("the same body twice without a key is two deliveries, each stored", async () => {
    mocks.insertInboundWebhookRequest
      .mockResolvedValueOnce({ id: "r-1" })
      .mockResolvedValueOnce({ id: "r-2" })

    await expect(record()).resolves.toEqual({
      duplicate: false,
      request: { id: "r-1" },
    })
    await expect(record()).resolves.toEqual({
      duplicate: false,
      request: { id: "r-2" },
    })
  })

  test("a failed insert fails the delivery so the sender retries", async () => {
    mocks.insertInboundWebhookRequest.mockRejectedValue(new Error("db down"))

    await expect(record()).rejects.toThrow("db down")
  })
})

describe("request lifecycle", () => {
  test("claims with a fresh token and a 15-minute lease", async () => {
    mocks.claimInboundWebhookRequest.mockResolvedValue({ id: "r-1" })
    const before = Date.now()

    const claimed = await inboundWebhookService.claimRequest("r-1")

    const [input] = mocks.claimInboundWebhookRequest.mock.calls[0] ?? []
    expect(input.id).toBe("r-1")
    expect(input.claimToken).toBe(claimed?.claimToken)
    expect(input.claimToken).toMatch(UUID)
    const lease = before - input.leaseExpiredBefore.getTime()
    expect(lease).toBeGreaterThanOrEqual(15 * 60 * 1000 - 50)
    expect(lease).toBeLessThan(15 * 60 * 1000 + 5000)
  })

  test("returns null when someone else owns the request", async () => {
    mocks.claimInboundWebhookRequest.mockResolvedValue(null)

    await expect(inboundWebhookService.claimRequest("r-1")).resolves.toBeNull()
  })

  test("lists requests that were never claimed for 2 minutes or whose lease ran out", async () => {
    const now = Date.now()

    await inboundWebhookService.listStaleRequests(500)

    const [input] = mocks.listStaleInboundWebhookRequests.mock.calls[0] ?? []
    expect(input.limit).toBe(500)
    expect(now - input.receivedBefore.getTime()).toBeGreaterThanOrEqual(
      120_000 - 50,
    )
    expect(now - input.leaseExpiredBefore.getTime()).toBeGreaterThanOrEqual(
      900_000 - 50,
    )
  })

  test("stops retrying a request after a day and then closes it as abandoned", async () => {
    mocks.failAbandonedInboundWebhookRequests.mockResolvedValue(3)
    const now = Date.now()

    await inboundWebhookService.listStaleRequests(10)
    await expect(inboundWebhookService.abandonStaleRequests()).resolves.toBe(3)

    const [listed] = mocks.listStaleInboundWebhookRequests.mock.calls[0] ?? []
    const [abandoned] =
      mocks.failAbandonedInboundWebhookRequests.mock.calls[0] ?? []
    const day = 24 * 60 * 60 * 1000
    expect(now - listed.createdAfter.getTime()).toBeGreaterThanOrEqual(day - 50)
    expect(now - abandoned.createdBefore.getTime()).toBeGreaterThanOrEqual(
      day - 50,
    )
    expect(abandoned.receivedBefore).toBeInstanceOf(Date)
    expect(abandoned.leaseExpiredBefore).toBeInstanceOf(Date)
  })

  test("request ids and statuses are scoped to the webhook's workspace", async () => {
    mocks.listInboundWebhookRequestsPaginated.mockResolvedValue({
      rows: [],
      total: 0,
    })

    await inboundWebhookService.listRequests({
      workspaceId: "ws-1",
      inboundWebhookId: "w-1",
      status: "failed",
      page: 2,
      perPage: 10,
    })

    expect(mocks.listInboundWebhookRequestsPaginated).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboundWebhookId: "w-1",
      status: "failed",
      limit: 10,
      offset: 10,
    })
  })

  test("a request of another webhook is a 404", async () => {
    mocks.findInboundWebhookRequest.mockResolvedValue(null)

    await expect(
      inboundWebhookService.findRequestOrFail({
        workspaceId: "ws-1",
        inboundWebhookId: "w-1",
        id: "r-9",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("previewMapping", () => {
  test("extracts with the workspace's context and writes nothing", async () => {
    mocks.loadExtractionContext.mockResolvedValue({
      targetCountry: "VN",
      customFieldTypeById: new Map(),
    })

    const result = await inboundWebhookService.previewMapping({
      workspaceId: "ws-1",
      payload: { phone: "0901234567" },
      inboxResolution: null,
      identifiers: [{ kind: "phone", jsonPath: "$.phone" }],
      fieldMappings: [],
    })

    expect(result.identities).toEqual({ phoneE164: "+84901234567" })
    expect(mocks.updateInboundWebhook).not.toHaveBeenCalled()
    expect(mocks.insertInboundWebhookRequest).not.toHaveBeenCalled()
  })

  test("shows the lookup the real delivery would use, given the inbox's channel", async () => {
    mocks.loadExtractionContext.mockResolvedValue({
      targetCountry: "VN",
      customFieldTypeById: new Map(),
    })
    mocks.resolveEffectiveChannel.mockResolvedValue({
      channel: "omnichannel",
      inbox: null,
    })

    const result = await inboundWebhookService.previewMapping({
      workspaceId: "ws-1",
      payload: { id: "x", phone: "0901234567" },
      inboxResolution: { mode: "inbox", inboxId: "5" },
      identifiers: [
        { kind: "channelUserId", jsonPath: "$.id" },
        { kind: "phone", jsonPath: "$.phone" },
      ],
      fieldMappings: [],
    })

    // Omnichannel has no source id to key on, so the channel user id is skipped.
    expect(result.contactLookup).toEqual({
      kind: "phone",
      value: "+84901234567",
    })
  })
})
