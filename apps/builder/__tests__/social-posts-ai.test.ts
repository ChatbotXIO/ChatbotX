// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const h = vi.hoisted(() => {
  class FakeProviderFailure extends Error {
    readonly code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  class FakeWriterError extends Error {
    readonly code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  class FakeUnavailable extends Error {}
  return {
    FakeProviderFailure,
    FakeUnavailable,
    FakeWriterError,
    assertNotBlocked: vi.fn(),
    callWriter: vi.fn(),
    generate: vi.fn(),
    getSettings: vi.fn(),
    limitsForDestinations: vi.fn(),
    resolveModel: vi.fn(),
  }
})

vi.mock("@chatbotx.io/business", () => ({
  PostAiProviderFailure: h.FakeProviderFailure,
  inboxTranslationSettingsService: { get: h.getSettings },
  languagePromptName: (code: string) => `lang:${code}`,
  normalizeLanguageCode: (code: string) => code.toLowerCase(),
  socialPostAiService: {
    generate: h.generate,
    limitsForDestinations: h.limitsForDestinations,
  },
  shortestLimit: (limits: { limit: number }[]) =>
    limits.length > 0 ? Math.min(...limits.map((item) => item.limit)) : null,
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code: string, status: number) {
      super(message)
      this.code = code
      this.httpStatusCode = status
    }
  },
}))
vi.mock("@chatbotx.io/ai/post-writer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/ai/post-writer")>()),
  PostWriterProviderError: h.FakeWriterError,
  generatePostText: h.callWriter,
}))
vi.mock("@chatbotx.io/ai/translation", () => ({
  TranslationIntegrationUnavailableError: h.FakeUnavailable,
  resolveTranslationModel: h.resolveModel,
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
  toLogSafeError: (error: unknown) => error,
}))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: h.assertNotBlocked,
}))

const { generatePostText } = await import(
  "../src/features/social-posts-ai/lib/generate-post-text"
)
const { generatePostTextRequest } = await import(
  "../src/features/social-posts-ai/schema"
)

const workspace = { id: "ws-1", ownerId: "owner-1" }
const request = {
  idempotencyKey: "key-1",
  language: "VI",
  mode: "rewrite" as const,
  text: "Sale today",
}
const result = {
  limit: null,
  text: "Big sale today",
  truncated: false,
  usage: { inputChars: 10, outputChars: 14 },
}

/** Runs the callbacks the way the service does: prepare first, then produce. */
const runCallbacks = async (input: {
  prepare: () => Promise<unknown>
  produce: (prepared: unknown) => Promise<string>
}) => {
  const prepared = await input.prepare()
  await input.produce(prepared)
  return result
}

describe("generatePostText", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.assertNotBlocked.mockResolvedValue(undefined)
    h.limitsForDestinations.mockResolvedValue([])
    h.getSettings.mockResolvedValue({ modelConfig: { provider: "openai" } })
    h.resolveModel.mockResolvedValue({ model: "m", modelId: "openai/x" })
    h.callWriter.mockResolvedValue("Big sale today")
    h.generate.mockImplementation(runCallbacks)
  })

  test("is refused in a trial-expired workspace before any model work", async () => {
    h.assertNotBlocked.mockRejectedValue(
      Object.assign(new Error("expired"), { code: "workspaceBlocked" }),
    )

    await expect(
      generatePostText({ actorId: "u1", request, workspace }),
    ).rejects.toMatchObject({ code: "workspaceBlocked" })
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.callWriter).not.toHaveBeenCalled()
  })

  test("answers aiModelNotChosen when no model was chosen, without calling the provider", async () => {
    h.getSettings.mockResolvedValue(null)

    await expect(
      generatePostText({ actorId: "u1", request, workspace }),
    ).rejects.toMatchObject({ code: "aiModelNotChosen", httpStatusCode: 409 })
    expect(h.callWriter).not.toHaveBeenCalled()
  })

  test("answers aiNeedsReconfiguration when the integration is gone", async () => {
    h.resolveModel.mockRejectedValue(new h.FakeUnavailable("gone"))

    await expect(
      generatePostText({ actorId: "u1", request, workspace }),
    ).rejects.toMatchObject({ code: "aiNeedsReconfiguration" })
  })

  test("hands the service the limit, the language name and a request without the key", async () => {
    h.limitsForDestinations.mockResolvedValue([
      { limit: 500, provider: "threads" },
      { limit: 2200, provider: "instagram" },
    ])

    await generatePostText({
      actorId: "u1",
      request: { ...request, destinationIds: ["2", "1", "2"] },
      workspace,
    })

    const call = h.generate.mock.calls[0]?.[0]
    expect(call.limits).toEqual([
      { limit: 500, provider: "threads" },
      { limit: 2200, provider: "instagram" },
    ])
    expect(call.idempotencyKey).toBe("key-1")
    expect(call.actorId).toBe("u1")
    expect(call.request).not.toHaveProperty("idempotencyKey")
    expect(call.request.destinationIds).toEqual(["1", "2"])
    expect(h.callWriter.mock.calls[0]?.[0].request).toMatchObject({
      languageName: "lang:vi",
      limit: 500,
      mode: "rewrite",
      text: "Sale today",
    })
  })

  test("fills the writing options from the networks and hashes the resolved values", async () => {
    h.limitsForDestinations.mockResolvedValue([
      { limit: 2200, provider: "instagram" },
      { limit: 500, provider: "threads" },
    ])

    await generatePostText({
      actorId: "u1",
      request: {
        ...request,
        callToActionText: "Book now",
        destinationIds: ["1", "2"],
        perNetwork: true,
        variants: 2,
      },
      workspace,
    })

    const writer = h.callWriter.mock.calls[0]?.[0].request
    expect(writer).toMatchObject({
      callToAction: true,
      callToActionText: "Book now",
      emoji: true,
      hashtags: true,
      perNetwork: true,
      providers: ["instagram", "threads"],
      variants: 2,
    })
    expect(writer.providerLimits).toHaveLength(2)
    expect(h.generate.mock.calls[0]?.[0].request).toMatchObject({
      emoji: true,
      hashtags: true,
      providers: ["instagram", "threads"],
    })
  })

  test("explicit toggles and providers win over the defaults", async () => {
    await generatePostText({
      actorId: "u1",
      request: {
        ...request,
        emoji: false,
        hashtags: false,
        providers: ["tiktok", "tiktok"],
      },
      workspace,
    })

    expect(h.callWriter.mock.calls[0]?.[0].request).toMatchObject({
      callToAction: false,
      emoji: false,
      hashtags: false,
      providers: ["tiktok"],
      variants: 1,
    })
  })

  test("returns the service result, whose text is the first variant", async () => {
    const withVariants = {
      hashtags: [],
      limit: null,
      text: "One",
      truncated: false,
      usage: { inputChars: 1, outputChars: 6 },
      variants: [
        { limit: null, provider: null, text: "One", truncated: false },
        { limit: null, provider: null, text: "Two", truncated: false },
      ],
    }
    h.generate.mockResolvedValue(withVariants)

    const out = await generatePostText({ actorId: "u1", request, workspace })

    expect(out.text).toBe(out.variants[0]?.text)
  })

  test("maps a stored provider failure to its API error", async () => {
    h.generate.mockRejectedValue(new h.FakeProviderFailure("timeout"))

    await expect(
      generatePostText({ actorId: "u1", request, workspace }),
    ).rejects.toMatchObject({ code: "aiTimeout", httpStatusCode: 504 })

    h.generate.mockRejectedValue(new h.FakeProviderFailure("providerError"))
    await expect(
      generatePostText({ actorId: "u1", request, workspace }),
    ).rejects.toMatchObject({ code: "aiProviderError", httpStatusCode: 502 })
  })

  test("maps a rate-limited writer failure to aiRateLimited", async () => {
    h.callWriter.mockRejectedValue(new h.FakeWriterError("rateLimited"))
    h.generate.mockImplementation(runCallbacks)

    await expect(
      generatePostText({ actorId: "u1", request, workspace }),
    ).rejects.toMatchObject({ code: "aiRateLimited", httpStatusCode: 429 })
  })

  describe("model choice", () => {
    test("uses the picked provider and model, not the translation settings", async () => {
      await generatePostText({
        actorId: "u1",
        request: { ...request, integrationId: "gemini", model: "g-1" },
        workspace,
      })

      expect(h.getSettings).not.toHaveBeenCalled()
      expect(h.resolveModel).toHaveBeenCalledWith({
        modelConfig: { model: "g-1", provider: "gemini" },
        workspaceId: "ws-1",
      })
    })

    test("maps an OpenAI-compatible integration id to its model config", async () => {
      await generatePostText({
        actorId: "u1",
        request: { ...request, integrationId: "123", model: "m-1" },
        workspace,
      })

      expect(h.resolveModel).toHaveBeenCalledWith({
        modelConfig: {
          integrationId: "123",
          kind: "openaiCompatible",
          model: "m-1",
        },
        workspaceId: "ws-1",
      })
    })

    test("rejects an integration of another workspace as needing reconfiguration", async () => {
      h.resolveModel.mockRejectedValue(new h.FakeUnavailable("foreign"))

      await expect(
        generatePostText({
          actorId: "u1",
          request: { ...request, integrationId: "999", model: "m-1" },
          workspace,
        }),
      ).rejects.toMatchObject({ code: "aiNeedsReconfiguration" })
      expect(h.callWriter).not.toHaveBeenCalled()
    })

    test("falls back to the translation settings model when none is picked", async () => {
      h.getSettings.mockResolvedValue({
        modelConfig: { model: "t", provider: "claude" },
      })

      await generatePostText({ actorId: "u1", request, workspace })

      expect(h.resolveModel).toHaveBeenCalledWith({
        modelConfig: { model: "t", provider: "claude" },
        workspaceId: "ws-1",
      })
    })

    test("the picked model is part of the idempotent request", async () => {
      await generatePostText({
        actorId: "u1",
        request: { ...request, integrationId: "openai", model: "a" },
        workspace,
      })

      expect(h.generate.mock.calls[0]?.[0].request).toMatchObject({
        integrationId: "openai",
        model: "a",
      })
    })
  })
})

describe("generatePostTextRequest model fields", () => {
  const parse = (extra: Record<string, unknown>) =>
    generatePostTextRequest.safeParse({
      ...request,
      language: "vi",
      ...extra,
    })

  test("accepts both fields, or neither", () => {
    expect(parse({ integrationId: "openai", model: "gpt" }).success).toBe(true)
    expect(parse({ integrationId: "42", model: "gpt" }).success).toBe(true)
    expect(parse({}).success).toBe(true)
  })

  test("rejects one field without the other", () => {
    expect(parse({ integrationId: "openai" }).success).toBe(false)
    expect(parse({ model: "gpt" }).success).toBe(false)
  })

  test("rejects an integrationId that is neither a provider nor an id", () => {
    expect(parse({ integrationId: "nope", model: "gpt" }).success).toBe(false)
  })

  test("stays a strict object", () => {
    expect(parse({ extra: 1 }).success).toBe(false)
  })
})

describe("generatePostTextRequest writing options", () => {
  const parse = (extra: Record<string, unknown>) =>
    generatePostTextRequest.safeParse({ ...request, language: "vi", ...extra })

  test("accepts the new options and keeps old requests valid", () => {
    expect(parse({}).success).toBe(true)
    expect(
      parse({
        callToAction: true,
        callToActionText: "Book now",
        emoji: false,
        hashtags: true,
        perNetwork: true,
        providers: ["facebook", "threads"],
        variants: 3,
      }).success,
    ).toBe(true)
  })

  test("rejects out-of-range or unknown values", () => {
    expect(parse({ variants: 0 }).success).toBe(false)
    expect(parse({ variants: 4 }).success).toBe(false)
    expect(parse({ variants: 1.5 }).success).toBe(false)
    expect(parse({ providers: ["myspace"] }).success).toBe(false)
    expect(parse({ callToActionText: "x".repeat(81) }).success).toBe(false)
    expect(parse({ callToActionText: "  " }).success).toBe(false)
  })

  test("mode hashtags needs the text to tag", () => {
    expect(
      generatePostTextRequest.safeParse({
        idempotencyKey: "k",
        mode: "hashtags",
      }).success,
    ).toBe(false)
    expect(parse({ mode: "hashtags" }).success).toBe(true)
  })
})
