import type { Job } from "bullmq"
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  findWorkspace: vi.fn(),
  findConversation: vi.fn(),
  findMessages: vi.fn(),
  findTranslations: vi.fn(),
  findContext: vi.fn(),
  applyResults: vi.fn(),
  ensureOwned: vi.fn(),
  release: vi.fn(),
  publish: vi.fn(),
  resolveModel: vi.fn(),
  translateBatch: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    inboxTranslationSettingsService: { get: mocks.getSettings },
    workspaceService: { find: mocks.findWorkspace },
    conversationService: { findBy: mocks.findConversation },
    translationService: {
      findMessages: mocks.findMessages,
      findTranslations: mocks.findTranslations,
      findLanguageContext: mocks.findContext,
      applyResults: mocks.applyResults,
    },
    ensureInflightOwned: mocks.ensureOwned,
    releaseInflight: mocks.release,
    queueWorkspaceRealtimeEvent: mocks.publish,
  }
})
vi.mock("@chatbotx.io/ai/server", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/ai/server")>(
    "@chatbotx.io/ai/server",
  )
  return {
    ...actual,
    resolveTranslationModel: mocks.resolveModel,
    translateBatch: mocks.translateBatch,
  }
})

const { handleTranslateMessages } = await import(
  "../src/ai-agent/handlers/translate-messages"
)
const { TranslationIntegrationUnavailableError, TranslationProviderError } =
  await import("@chatbotx.io/ai/server")
const { hashSourceText } = await import("@chatbotx.io/business")

const PLACEHOLDER = /⟦\d+⟧/u
const ENABLED_AT = new Date("2026-11-01T00:00:00.000Z")
const T1 = new Date("2026-11-10T00:00:00.000Z")
const T2 = new Date("2026-11-10T00:00:05.000Z")

const message = (id: string, createdAt: Date, text: string) => ({
  id,
  createdAt,
  conversationId: "c1",
  contactInboxId: "ci1",
  direction: "incoming" as const,
  type: "message" as const,
  contentType: "text" as const,
  text,
  deletedAt: null,
})

const data = (
  ids: { id: string; createdAt: Date }[],
  overrides: Record<string, unknown> = {},
) => ({
  workspaceId: "w1",
  conversationId: "c1",
  messages: ids,
  retryFailed: false,
  requestId: "req-1",
  ...overrides,
})

const jobOnAttempt = (attemptsMade: number, attempts = 3) =>
  ({ id: "job-1", attemptsMade, opts: { attempts } }) as unknown as Job

const translated = (id: string, detectedLanguage = "es") => ({
  id,
  detectedLanguage,
  confidence: 0.95,
  translatedText: `vi:${id}`,
})

type AppliedItem = {
  kind: string
  messageId: string
  failureCode?: string
  translatedText?: string
}
const appliedItems = (): AppliedItem[] =>
  mocks.applyResults.mock.calls.flatMap(
    ([call]) => (call as { items: AppliedItem[] }).items,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSettings.mockResolvedValue({
    enabled: true,
    enabledAt: ENABLED_AT,
    modelConfig: { provider: "openai", model: "m" },
  })
  mocks.findWorkspace.mockResolvedValue({ id: "w1", language: "vi" })
  mocks.findConversation.mockResolvedValue({
    id: "c1",
    assignedUserId: "u1",
    assignedInboxTeamId: null,
    additionalAttributes: null,
  })
  mocks.ensureOwned.mockResolvedValue(true)
  mocks.release.mockResolvedValue(true)
  mocks.findTranslations.mockResolvedValue([])
  mocks.findContext.mockResolvedValue([])
  mocks.resolveModel.mockResolvedValue({ model: "model", modelId: "openai/m" })
  mocks.applyResults.mockImplementation(
    async (input: { items: { messageId: string; kind: string }[] }) => ({
      rows: input.items.map((item) => ({
        messageId: item.messageId,
        status: item.kind === "failed" ? "failed" : "translated",
        displayText: "x",
        sourceLanguage: "es",
        targetLanguage: "vi",
      })),
    }),
  )
  mocks.findMessages.mockImplementation(
    async (_workspaceId: string, refs: { id: string }[]) =>
      refs.map((ref) =>
        message(ref.id, ref.id === "m1" ? T1 : T2, `quiero cambiar ${ref.id}`),
      ),
  )
  mocks.translateBatch.mockImplementation(
    async (props: { items: { id: string }[] }) =>
      props.items.map((item) => translated(item.id)),
  )
})

const run = (
  ids = [{ id: "m1", createdAt: T1 }],
  options: { job?: Job; overrides?: Record<string, unknown> } = {},
) =>
  handleTranslateMessages(
    options.job ?? jobOnAttempt(0),
    data(ids, options.overrides),
  )

describe("handleTranslateMessages", () => {
  test("translates a message, stores it, announces it and releases the claim", async () => {
    await run()

    expect(mocks.translateBatch).toHaveBeenCalledTimes(1)
    expect(mocks.translateBatch.mock.calls[0]?.[0]).toMatchObject({
      targetLanguage: "vi",
      callTimeoutMs: 15_000,
    })
    expect(appliedItems()).toEqual([
      expect.objectContaining({
        kind: "translated",
        messageId: "m1",
        translatedText: "vi:m1",
      }),
    ])
    expect(mocks.publish).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({
        eventType: "messageTranslationUpdated",
        route: { assignedTeamIds: [], assignedUserIds: ["u1"] },
      }),
    )
    expect(mocks.release).toHaveBeenCalledWith("w1", "m1", "req-1")
  })

  test("batches at most 10 messages per provider call, oldest first", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i + 1}`,
      createdAt: T2,
    }))
    mocks.findMessages.mockImplementation(
      async (_w: string, refs: { id: string }[]) =>
        refs.map((ref) => message(ref.id, T2, `quiero cambiar ${ref.id}`)),
    )

    await run(ids)

    const sizes = mocks.translateBatch.mock.calls.map(
      ([call]) => (call as { items: unknown[] }).items.length,
    )
    // The two batches run at the same time, so the order of the calls is not fixed.
    expect([...sizes].sort((a, b) => b - a)).toEqual([10, 2])
  })

  test("two batches are translated at the same time, not one after the other", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i + 1}`,
      createdAt: T2,
    }))
    mocks.findMessages.mockImplementation(
      async (_w: string, refs: { id: string }[]) =>
        refs.map((ref) => message(ref.id, T2, `quiero cambiar ${ref.id}`)),
    )
    const gates: (() => void)[] = []
    mocks.translateBatch.mockImplementation(
      (props: { items: { id: string }[] }) =>
        new Promise((resolve) => {
          gates.push(() =>
            resolve(props.items.map((item) => translated(item.id))),
          )
        }),
    )

    const finished = run(ids)
    await vi.waitFor(() =>
      expect(mocks.translateBatch).toHaveBeenCalledTimes(2),
    )
    // Both provider calls are in flight before either has answered.
    expect(gates).toHaveLength(2)
    for (const open of gates) {
      open()
    }
    await finished

    const items = appliedItems()
    expect(items.filter((item) => item.kind === "translated")).toHaveLength(12)
  })

  test.each([
    [
      "the workspace turned it off",
      () => mocks.getSettings.mockResolvedValue({ enabled: false }),
    ],
    [
      "the conversation opted out",
      () =>
        mocks.findConversation.mockResolvedValue({
          id: "c1",
          additionalAttributes: { translation: { enabledOverride: false } },
        }),
    ],
  ])("does nothing but release the claim when %s", async (_name, arrange) => {
    arrange()

    await run()

    expect(mocks.translateBatch).not.toHaveBeenCalled()
    expect(mocks.applyResults).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledWith("w1", "m1", "req-1")
  })

  test("a duplicate job is a no-op: another request owns the marker", async () => {
    mocks.ensureOwned.mockResolvedValue(false)

    await run()

    expect(mocks.findMessages).not.toHaveBeenCalled()
    expect(mocks.translateBatch).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("a message that already has a good row is skipped without a provider call", async () => {
    mocks.findTranslations.mockResolvedValue([
      {
        messageId: "m1",
        direction: "inbound",
        status: "translated",
        targetLanguage: "vi",
      },
    ])

    await run()

    expect(mocks.translateBatch).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledWith("w1", "m1", "req-1")
  })

  test("noise is dropped before the provider is called", async () => {
    mocks.findMessages.mockResolvedValue([message("m1", T1, "👍")])

    await run()

    expect(mocks.translateBatch).not.toHaveBeenCalled()
    expect(mocks.applyResults).not.toHaveBeenCalled()
  })

  test("masks fragments before sending and restores them after", async () => {
    mocks.findMessages.mockResolvedValue([
      message("m1", T1, "mira https://example.com por favor"),
    ])
    mocks.translateBatch.mockImplementation(
      async (props: { items: { id: string; maskedText: string }[] }) =>
        props.items.map((item) => ({
          ...translated(item.id),
          translatedText: `xem ${item.maskedText.match(PLACEHOLDER)?.[0]} nhé`,
        })),
    )

    await run()

    const sent = (
      mocks.translateBatch.mock.calls[0]?.[0] as {
        items: { maskedText: string }[]
      }
    ).items[0]?.maskedText
    expect(sent).not.toContain("example.com")
    expect(appliedItems()[0]?.translatedText).toBe(
      "xem https://example.com nhé",
    )
  })

  test("a translation that loses a placeholder is stored as failed unsafeOutput, the rest still saved", async () => {
    mocks.findMessages.mockImplementation(
      async (_w: string, refs: { id: string }[]) =>
        refs.map((ref) =>
          message(
            ref.id,
            ref.id === "m1" ? T1 : T2,
            ref.id === "m1"
              ? "mira https://example.com por favor"
              : "quiero cambiar la talla",
          ),
        ),
    )
    mocks.translateBatch.mockImplementation(
      async (props: { items: { id: string }[] }) =>
        props.items.map((item) => translated(item.id)),
    )

    await run([
      { id: "m1", createdAt: T1 },
      { id: "m2", createdAt: T2 },
    ])

    expect(appliedItems()).toEqual([
      expect.objectContaining({
        kind: "failed",
        messageId: "m1",
        failureCode: "unsafeOutput",
      }),
      expect.objectContaining({ kind: "translated", messageId: "m2" }),
    ])
  })

  test("a message the model left unanswered is stored as failed providerError, the rest still saved", async () => {
    mocks.findMessages.mockImplementation(
      async (_w: string, refs: { id: string }[]) =>
        refs.map((ref) =>
          message(ref.id, ref.id === "m1" ? T1 : T2, "quiero cambiar la talla"),
        ),
    )
    mocks.translateBatch.mockImplementation(
      async (props: { items: { id: string }[] }) =>
        props.items
          .filter((item) => item.id !== "m1")
          .map((item) => translated(item.id)),
    )

    await run([
      { id: "m1", createdAt: T1 },
      { id: "m2", createdAt: T2 },
    ])

    expect(appliedItems()).toEqual([
      expect.objectContaining({
        kind: "failed",
        messageId: "m1",
        failureCode: "providerError",
      }),
      expect.objectContaining({ kind: "translated", messageId: "m2" }),
    ])
  })

  test("drops the result of a message the customer edited while the provider ran", async () => {
    let reads = 0
    mocks.findMessages.mockImplementation(
      (_w: string, refs: { id: string }[]) => {
        reads += 1
        return Promise.resolve(
          refs.map((ref) =>
            message(
              ref.id,
              T1,
              reads < 2 ? "quiero cambiar la talla" : "texto editado ahora",
            ),
          ),
        )
      },
    )

    await run()

    expect(mocks.translateBatch).toHaveBeenCalledTimes(1)
    expect(appliedItems()).toEqual([])
    // The edit hook owns cleanup of the claim; this job still frees its own.
    expect(mocks.release).toHaveBeenCalledWith("w1", "m1", "req-1")
  })

  test("a result for a message unsent meanwhile is not written", async () => {
    let reads = 0
    mocks.findMessages.mockImplementation(
      (_w: string, refs: { id: string }[]) => {
        reads += 1
        return Promise.resolve(
          refs.map((ref) => ({
            ...message(ref.id, T1, "quiero cambiar la talla"),
            deletedAt: reads < 2 ? null : new Date(),
          })),
        )
      },
    )

    await run()

    expect(appliedItems()).toEqual([])
  })

  test("sets the sourceHash the stored row will be compared with", async () => {
    await run()

    const expected = await hashSourceText("quiero cambiar m1")
    expect(
      (
        mocks.applyResults.mock.calls[0]?.[0] as {
          items: { sourceHash: string }[]
        }
      ).items[0]?.sourceHash,
    ).toBe(expected)
  })

  describe("provider failures", () => {
    test("a transient failure throws for a retry and stores nothing before the final attempt", async () => {
      const failure = new TranslationProviderError("timeout", null)
      mocks.translateBatch.mockRejectedValue(failure)

      await expect(run(undefined, { job: jobOnAttempt(0) })).rejects.toBe(
        failure,
      )

      expect(mocks.applyResults).not.toHaveBeenCalled()
      expect(mocks.release).not.toHaveBeenCalled()
    })

    test("on the final attempt it stores failed with the code, frees the claim, and still throws", async () => {
      const failure = new TranslationProviderError("rateLimited", null)
      mocks.translateBatch.mockRejectedValue(failure)

      await expect(run(undefined, { job: jobOnAttempt(2) })).rejects.toBe(
        failure,
      )

      expect(appliedItems()).toEqual([
        expect.objectContaining({
          kind: "failed",
          messageId: "m1",
          failureCode: "rateLimited",
        }),
      ])
      expect(mocks.release).toHaveBeenCalledWith("w1", "m1", "req-1")
    })

    test("a failure of text the customer edited while the provider ran is not stored", async () => {
      let reads = 0
      mocks.findMessages.mockImplementation(
        (_w: string, refs: { id: string }[]) => {
          reads += 1
          return Promise.resolve(
            refs.map((ref) =>
              message(
                ref.id,
                T1,
                reads < 2 ? "quiero cambiar la talla" : "texto editado ahora",
              ),
            ),
          )
        },
      )
      const failure = new TranslationProviderError("providerError", null)
      mocks.translateBatch.mockRejectedValue(failure)

      await expect(run(undefined, { job: jobOnAttempt(2) })).rejects.toBe(
        failure,
      )

      // A stale `failed` row would stop the inbox asking again for the edit.
      expect(appliedItems()).toEqual([])
      expect(mocks.release).toHaveBeenCalledWith("w1", "m1", "req-1")
    })

    test("a failure is not stored for a message another request took over", async () => {
      // Owned when the job starts and before the provider call; an edit then
      // cleared the claim and a newer request holds it.
      mocks.ensureOwned
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false)
      mocks.translateBatch.mockRejectedValue(
        new TranslationProviderError("integrationUnavailable", null),
      )

      await expect(
        run(undefined, { job: jobOnAttempt(0) }),
      ).rejects.toBeInstanceOf(UnrecoverableError)

      expect(appliedItems()).toEqual([])
    })

    test("an unresolvable integration does not store failed for edited text", async () => {
      let reads = 0
      mocks.findMessages.mockImplementation(
        (_w: string, refs: { id: string }[]) => {
          reads += 1
          return Promise.resolve(
            refs.map((ref) =>
              message(ref.id, T1, reads < 2 ? "quiero cambiar" : "editado"),
            ),
          )
        },
      )
      mocks.resolveModel.mockRejectedValue(
        new TranslationIntegrationUnavailableError("gone"),
      )

      await expect(run()).rejects.toBeInstanceOf(UnrecoverableError)

      expect(appliedItems()).toEqual([])
    })

    test("an auth failure is unrecoverable: stored failed at once, no retry", async () => {
      mocks.translateBatch.mockRejectedValue(
        new TranslationProviderError("integrationUnavailable", null),
      )

      await expect(
        run(undefined, { job: jobOnAttempt(0) }),
      ).rejects.toBeInstanceOf(UnrecoverableError)

      expect(appliedItems()[0]).toMatchObject({
        kind: "failed",
        failureCode: "integrationUnavailable",
      })
    })

    test("an integration that cannot be resolved is stored failed and unrecoverable", async () => {
      mocks.resolveModel.mockRejectedValue(
        new TranslationIntegrationUnavailableError("gone"),
      )

      await expect(run()).rejects.toBeInstanceOf(UnrecoverableError)

      expect(mocks.translateBatch).not.toHaveBeenCalled()
      expect(appliedItems()[0]).toMatchObject({
        kind: "failed",
        failureCode: "integrationUnavailable",
      })
    })

    test("a failing batch keeps what the other batch stored and fails only its own", async () => {
      const ids = Array.from({ length: 12 }, (_, i) => ({
        id: `m${i + 1}`,
        createdAt: T2,
      }))
      mocks.findMessages.mockImplementation(
        async (_w: string, refs: { id: string }[]) =>
          refs.map((ref) => message(ref.id, T2, `quiero cambiar ${ref.id}`)),
      )
      // The batch of 2 answers; the batch of 10 fails.
      mocks.translateBatch.mockImplementation(
        (props: { items: { id: string }[] }) =>
          props.items.length === 2
            ? Promise.resolve(props.items.map((item) => translated(item.id)))
            : Promise.reject(
                new TranslationProviderError("providerError", null),
              ),
      )

      await expect(run(ids, { job: jobOnAttempt(2) })).rejects.toBeInstanceOf(
        TranslationProviderError,
      )

      const items = appliedItems()
      expect(items.filter((item) => item.kind === "translated")).toHaveLength(2)
      expect(items.filter((item) => item.kind === "failed")).toHaveLength(10)
    })

    test("when both batches fail, a non-retryable failure is the one thrown", async () => {
      const ids = Array.from({ length: 12 }, (_, i) => ({
        id: `m${i + 1}`,
        createdAt: T2,
      }))
      mocks.findMessages.mockImplementation(
        async (_w: string, refs: { id: string }[]) =>
          refs.map((ref) => message(ref.id, T2, `quiero cambiar ${ref.id}`)),
      )
      mocks.translateBatch.mockImplementation(
        (props: { items: { id: string }[] }) =>
          Promise.reject(
            new TranslationProviderError(
              props.items.length === 2
                ? "integrationUnavailable"
                : "providerError",
              null,
            ),
          ),
      )

      await expect(run(ids, { job: jobOnAttempt(1) })).rejects.toBeInstanceOf(
        UnrecoverableError,
      )
    })

    test("each attempt has an overall deadline signal for all provider calls", async () => {
      await run()

      const { signal } = mocks.translateBatch.mock.calls[0]?.[0] as {
        signal: AbortSignal
      }
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(signal.aborted).toBe(false)
    })
  })

  test("passes up to three earlier customer messages, masked, as language context", async () => {
    mocks.findContext.mockResolvedValue([
      "hola ver https://example.com",
      "que tal",
    ])

    await run()

    expect(mocks.findContext).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, before: T1 }),
    )
    const { context } = mocks.translateBatch.mock.calls[0]?.[0] as {
      context: string[]
    }
    expect(context).toHaveLength(2)
    expect(context[0]).not.toContain("example.com")
  })

  test("announces the conversation language when the store set it", async () => {
    mocks.applyResults.mockResolvedValue({
      rows: [
        {
          messageId: "m1",
          status: "translated",
          displayText: "x",
          sourceLanguage: "es",
          targetLanguage: "vi",
        },
      ],
      conversationLanguage: "es",
    })

    await run()

    expect(mocks.publish).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({
        data: expect.objectContaining({ conversationLanguage: "es" }),
      }),
    )
  })
})
