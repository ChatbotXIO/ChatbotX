import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimKey: vi.fn(),
  releaseKeyIfOwner: vi.fn(),
  deleteKey: vi.fn(),
  getSettings: vi.fn(),
  findWorkspace: vi.fn(),
  findConversation: vi.fn(),
  setLanguageIfUnset: vi.fn(),
  findManyForTranslation: vi.fn(),
  findByMessageIds: vi.fn(),
  upsertResult: vi.fn(),
  deleteByMessageId: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    claimKey: mocks.claimKey,
    releaseKeyIfOwner: mocks.releaseKeyIfOwner,
    delete: mocks.deleteKey,
  },
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))
vi.mock("../src/translation/settings-service", () => ({
  inboxTranslationSettingsService: { get: mocks.getSettings },
}))
vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))
vi.mock("../src/conversation/service", () => ({
  conversationService: {
    findBy: mocks.findConversation,
    setTranslationLanguageIfUnset: mocks.setLanguageIfUnset,
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(async () => ({
    findManyForTranslation: mocks.findManyForTranslation,
  })),
  messageTranslationRepository: {
    findByMessageIds: mocks.findByMessageIds,
    upsertResult: mocks.upsertResult,
    deleteByMessageId: mocks.deleteByMessageId,
  },
}))
vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))

const { translationService } = await import("../src/translation/service")

const ENABLED_AT = new Date("2026-11-01T00:00:00.000Z")
const CREATED_AT = new Date("2026-11-10T00:00:00.000Z")

const incoming = (id: string, text = "quiero cambiar la talla") => ({
  id,
  createdAt: CREATED_AT,
  conversationId: "c1",
  contactInboxId: "ci1",
  direction: "incoming",
  type: "message",
  contentType: "text",
  text,
  deletedAt: null,
})

const request = (
  overrides: Partial<
    Parameters<typeof translationService.requestMessages>[0]
  > = {},
) => {
  const enqueue = vi.fn(async () => undefined)
  const promise = translationService.requestMessages({
    workspaceId: "w1",
    conversationId: "c1",
    refs: [
      { id: "m1", createdAt: CREATED_AT },
      { id: "m2", createdAt: CREATED_AT },
    ],
    retryFailed: false,
    modelAvailable: true,
    enqueue,
    ...overrides,
  })
  return { enqueue, promise }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSettings.mockResolvedValue({ enabled: true, enabledAt: ENABLED_AT })
  mocks.findWorkspace.mockResolvedValue({ id: "w1", language: "vi" })
  mocks.findConversation.mockResolvedValue({
    id: "c1",
    additionalAttributes: null,
  })
  mocks.findManyForTranslation.mockResolvedValue([
    incoming("m1"),
    incoming("m2"),
  ])
  mocks.findByMessageIds.mockResolvedValue([])
  mocks.claimKey.mockResolvedValue(true)
  mocks.releaseKeyIfOwner.mockResolvedValue(true)
  mocks.upsertResult.mockImplementation(async (input) => ({
    ...input,
    id: "t",
  }))
  mocks.setLanguageIfUnset.mockResolvedValue(null)
})

describe("translationService.requestMessages", () => {
  test("claims a marker per accepted message and enqueues them with one requestId", async () => {
    const { enqueue, promise } = request()

    const result = await promise

    expect(result).toEqual({ accepted: ["m1", "m2"], skipped: [] })
    expect(enqueue).toHaveBeenCalledTimes(1)
    const job = (
      enqueue.mock.calls as unknown as [Record<string, unknown>][]
    )[0]?.[0]
    expect(job).toMatchObject({
      workspaceId: "w1",
      conversationId: "c1",
      retryFailed: false,
      messages: [
        { id: "m1", createdAt: CREATED_AT },
        { id: "m2", createdAt: CREATED_AT },
      ],
    })
    expect(mocks.claimKey).toHaveBeenCalledWith(
      "inflight:w1:m1",
      job?.requestId,
      180,
    )
  })

  test("a message another request already claimed is skipped as inFlight", async () => {
    mocks.claimKey.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const { enqueue, promise } = request()

    const result = await promise

    expect(result).toEqual({
      accepted: ["m1"],
      skipped: [{ id: "m2", reason: "inFlight" }],
    })
    expect(
      (enqueue.mock.calls as unknown as [{ messages: unknown[] }][])[0]?.[0]
        .messages,
    ).toHaveLength(1)
  })

  test("releases the markers it claimed when the enqueue fails", async () => {
    const { promise } = request({
      enqueue: vi.fn(() => Promise.reject(new Error("redis down"))),
    })

    await expect(promise).rejects.toThrow("redis down")

    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledTimes(2)
    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledWith(
      "inflight:w1:m1",
      expect.any(String),
    )
  })

  test("nothing accepted means no enqueue", async () => {
    mocks.findManyForTranslation.mockResolvedValue([
      incoming("m1", "👍"),
      incoming("m2", "ok"),
    ])
    const { enqueue, promise } = request()

    const result = await promise

    expect(result.accepted).toEqual([])
    expect(result.skipped.map((s) => s.reason)).toEqual(["noise", "noise"])
    expect(enqueue).not.toHaveBeenCalled()
    expect(mocks.claimKey).not.toHaveBeenCalled()
  })

  test.each([
    ["the model is unavailable", { modelAvailable: false }, "unavailable"],
  ])("when %s nothing is read, claimed or queued", async (_name, overrides, reason) => {
    const { enqueue, promise } = request(overrides)

    const result = await promise

    expect(result.skipped.map((s) => s.reason)).toEqual([reason, reason])
    expect(mocks.findManyForTranslation).not.toHaveBeenCalled()
    expect(mocks.claimKey).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  test("the workspace setting off disables, and a conversation override of false disables", async () => {
    mocks.getSettings.mockResolvedValue({
      enabled: false,
      enabledAt: ENABLED_AT,
    })
    expect((await request().promise).skipped[0]?.reason).toBe("disabled")

    mocks.getSettings.mockResolvedValue({
      enabled: true,
      enabledAt: ENABLED_AT,
    })
    mocks.findConversation.mockResolvedValue({
      id: "c1",
      additionalAttributes: { translation: { enabledOverride: false } },
    })
    expect((await request().promise).skipped[0]?.reason).toBe("disabled")
  })

  test("rejects more than 20 messages", async () => {
    const refs = Array.from({ length: 21 }, (_, i) => ({
      id: `m${i}`,
      createdAt: CREATED_AT,
    }))

    await expect(request({ refs }).promise).rejects.toMatchObject({
      code: "validation",
    })
    expect(mocks.findManyForTranslation).not.toHaveBeenCalled()
  })
})

describe("translationService.applyResults", () => {
  const translated = (
    messageId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    kind: "translated" as const,
    messageId,
    messageCreatedAt: CREATED_AT,
    text: "quiero cambiar la talla",
    sourceHash: `hash-${messageId}`,
    detectedLanguage: "es",
    confidence: 0.97,
    translatedText: "tôi muốn đổi size",
    modelId: "openai/gpt-x",
    ...overrides,
  })

  const apply = (
    items: Parameters<typeof translationService.applyResults>[0]["items"],
  ) =>
    translationService.applyResults({
      workspaceId: "w1",
      conversationId: "c1",
      items,
    })

  test("stores the translation against the workspace language, and sets the language from a reliable detection", async () => {
    mocks.setLanguageIfUnset.mockResolvedValue({ id: "c1" })

    const outcome = await apply([translated("m1")])

    expect(mocks.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        conversationId: "c1",
        messageId: "m1",
        direction: "inbound",
        status: "translated",
        sourceLanguage: "es",
        targetLanguage: "vi",
        displayText: "tôi muốn đổi size",
        sourceHash: "hash-m1",
        failureCode: null,
      }),
    )
    expect(mocks.setLanguageIfUnset).toHaveBeenCalledWith({
      workspaceId: "w1",
      conversationId: "c1",
      language: "es",
      workspaceLanguage: "vi",
    })
    expect(outcome.conversationLanguage).toBe("es")
    expect(outcome.rows).toHaveLength(1)
  })

  test("a message already in the workspace language is stored as skipped, without display text", async () => {
    await apply([translated("m1", { detectedLanguage: "vi" })])

    expect(mocks.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        displayText: null,
        sourceLanguage: "vi",
      }),
    )
  })

  test.each([
    ["empty", ""],
    ["whitespace-only", "  \n "],
  ])("an %s answer is stored as failed (retryable), not as a translation", async (_label, translatedText) => {
    await apply([translated("m1", { translatedText })])

    expect(mocks.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "m1",
        status: "failed",
        displayText: null,
        failureCode: "unsafeOutput",
      }),
    )
  })

  test("an empty answer for a message already in the workspace language stays skipped", async () => {
    await apply([
      translated("m1", { detectedLanguage: "vi", translatedText: "" }),
    ])

    expect(mocks.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        displayText: null,
        failureCode: null,
      }),
    )
  })

  test("an unreliable detection stores the translation but does not touch the language", async () => {
    const outcome = await apply([translated("m1", { text: "ok thanks" })])

    expect(mocks.upsertResult).toHaveBeenCalledTimes(1)
    expect(mocks.setLanguageIfUnset).not.toHaveBeenCalled()
    expect(outcome.conversationLanguage).toBeUndefined()
  })

  test("the earliest reliable message decides the language", async () => {
    await apply([
      translated("m2", {
        messageCreatedAt: new Date("2026-11-10T00:00:10.000Z"),
        detectedLanguage: "en",
      }),
      translated("m1", { detectedLanguage: "es" }),
    ])

    expect(mocks.setLanguageIfUnset).toHaveBeenCalledTimes(1)
    expect(mocks.setLanguageIfUnset).toHaveBeenCalledWith(
      expect.objectContaining({ language: "es" }),
    )
  })

  test("no conversationLanguage when the write was refused (a language was already set)", async () => {
    mocks.setLanguageIfUnset.mockResolvedValue(null)

    const outcome = await apply([translated("m1")])

    expect(outcome.conversationLanguage).toBeUndefined()
  })

  test("a failed item is stored as failed with its code and never sets a language", async () => {
    const outcome = await apply([
      {
        kind: "failed",
        messageId: "m1",
        messageCreatedAt: CREATED_AT,
        sourceHash: "hash-m1",
        failureCode: "timeout",
        modelId: null,
      },
    ])

    expect(mocks.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failureCode: "timeout",
        displayText: null,
        sourceLanguage: null,
      }),
    )
    expect(mocks.setLanguageIfUnset).not.toHaveBeenCalled()
    expect(outcome.rows).toHaveLength(1)
  })

  test("a row the repository kept (null) is left out of the result", async () => {
    mocks.upsertResult.mockResolvedValue(null)

    const outcome = await apply([translated("m1")])

    expect(outcome.rows).toEqual([])
  })

  test("no items means no work", async () => {
    await expect(apply([])).resolves.toEqual({ rows: [] })
    expect(mocks.findWorkspace).not.toHaveBeenCalled()
  })
})

describe("translationService.deleteForMessage", () => {
  test("removes the row and the in-flight claim", async () => {
    mocks.deleteByMessageId.mockResolvedValue(true)

    await expect(
      translationService.deleteForMessage({
        workspaceId: "w1",
        messageId: "m1",
      }),
    ).resolves.toBe(true)

    expect(mocks.deleteByMessageId).toHaveBeenCalledWith("w1", "m1")
    expect(mocks.deleteKey).toHaveBeenCalledWith("inflight:w1:m1")
  })
})
