import { APICallError, NoObjectGeneratedError } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }))

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}))

const {
  TranslationProviderError,
  toTranslationFailureCode,
  translateBatch,
  translateSentence,
  translationProviderOptions,
} = await import("../src/server/services/translator")

const entry = (id: string, translatedText = `vi:${id}`) => ({
  id,
  detectedLanguage: "es",
  confidence: 0.95,
  translatedText,
})

const run = (ids: string[], signal?: AbortSignal) =>
  translateBatch({
    model: "model" as never,
    items: ids.map((id) => ({ id, maskedText: `es:${id}` })),
    context: ["hola"],
    targetLanguage: "vi",
    targetLanguageName: "Tiếng Việt",
    signal,
  })

const noObject = () =>
  new NoObjectGeneratedError({
    message: "bad json",
    response: {} as never,
    usage: {} as never,
    finishReason: "other",
  })

const apiError = (statusCode: number) =>
  new APICallError({
    message: "provider error",
    url: "https://api.example.com",
    requestBodyValues: {},
    statusCode,
  })

beforeEach(() => {
  mocks.generateText.mockReset()
})

describe("translateBatch", () => {
  test("translates a whole batch with one provider call", async () => {
    mocks.generateText.mockResolvedValue({
      output: { translations: [entry("1"), entry("2")] },
    })

    const results = await run(["1", "2"])

    expect(mocks.generateText).toHaveBeenCalledTimes(1)
    expect(results.map((r) => r.id)).toEqual(["1", "2"])
    expect(results[0]).toMatchObject({
      detectedLanguage: "es",
      translatedText: "vi:1",
    })
  })

  test("passes no tools and sends customer text only inside the JSON prompt", async () => {
    mocks.generateText.mockResolvedValue({
      output: { translations: [entry("1")] },
    })

    await run(["1"])

    const call = mocks.generateText.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(call).not.toHaveProperty("tools")
    expect(JSON.parse(call.prompt as string)).toEqual({
      targetLanguage: "Tiếng Việt (vi)",
      context: ["hola"],
      messages: [{ id: "1", text: "es:1" }],
    })
    expect(call.system as string).not.toContain("es:1")
  })

  test("falls back to one call per message when ids are missing or extra", async () => {
    mocks.generateText
      .mockResolvedValueOnce({ output: { translations: [entry("1")] } })
      .mockResolvedValueOnce({ output: { translations: [entry("1")] } })
      .mockResolvedValueOnce({ output: { translations: [entry("2")] } })

    const results = await run(["1", "2"])

    expect(mocks.generateText).toHaveBeenCalledTimes(3)
    expect(results.map((r) => r.id)).toEqual(["1", "2"])
  })

  test("falls back to per-message calls when the output is not valid JSON", async () => {
    mocks.generateText
      .mockRejectedValueOnce(noObject())
      .mockResolvedValueOnce({ output: { translations: [entry("1")] } })
      .mockResolvedValueOnce({ output: { translations: [entry("2")] } })

    await expect(run(["1", "2"])).resolves.toHaveLength(2)
  })

  test("keeps the messages answered on their own when one of them cannot be", async () => {
    mocks.generateText
      .mockResolvedValueOnce({ output: { translations: [entry("1")] } })
      .mockResolvedValueOnce({ output: { translations: [entry("1")] } })
      .mockResolvedValueOnce({ output: { translations: [entry("other")] } })
      .mockResolvedValueOnce({ output: { translations: [entry("3")] } })

    const results = await run(["1", "2", "3"])

    expect(mocks.generateText).toHaveBeenCalledTimes(4)
    expect(results.map((r) => r.id)).toEqual(["1", "3"])
  })

  test("fails with providerError when a single message still gets the wrong id", async () => {
    mocks.generateText.mockResolvedValue({
      output: { translations: [entry("other")] },
    })

    await expect(run(["1"])).rejects.toMatchObject({
      code: "providerError",
    })
  })

  test("clamps confidence and defaults an empty language to und", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        translations: [
          {
            id: "1",
            detectedLanguage: " ",
            confidence: 7,
            translatedText: "x",
          },
        ],
      },
    })

    const [result] = await run(["1"])

    expect(result).toMatchObject({ detectedLanguage: "und", confidence: 1 })
  })

  test("returns nothing for no items and rejects more than 10", async () => {
    await expect(run([])).resolves.toEqual([])
    await expect(
      run(Array.from({ length: 11 }, (_, i) => String(i))),
    ).rejects.toBeInstanceOf(RangeError)
    expect(mocks.generateText).not.toHaveBeenCalled()
  })

  test("forwards the abort signal and maps an abort to timeout without retrying", async () => {
    const controller = new AbortController()
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    )

    await expect(run(["1", "2"], controller.signal)).rejects.toMatchObject({
      code: "timeout",
      retryable: true,
    })
    expect(mocks.generateText).toHaveBeenCalledTimes(1)
    expect(mocks.generateText.mock.calls[0]?.[0]).toMatchObject({
      abortSignal: controller.signal,
    })
  })
})

describe("translateBatch call timeout", () => {
  test("gives every provider call its own signal that aborts on the caller's signal too", async () => {
    mocks.generateText
      .mockResolvedValueOnce({ output: { translations: [] } })
      .mockResolvedValueOnce({ output: { translations: [entry("1")] } })
    const overall = new AbortController()

    await translateBatch({
      model: "model" as never,
      items: [{ id: "1", maskedText: "x" }],
      targetLanguage: "vi",
      signal: overall.signal,
      callTimeoutMs: 15_000,
    })

    const signals = mocks.generateText.mock.calls.map(
      ([call]) => (call as { abortSignal: AbortSignal }).abortSignal,
    )
    expect(signals).toHaveLength(2)
    expect(signals[0]).not.toBe(signals[1])
    overall.abort()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  test("without callTimeoutMs the caller's signal is used as is", async () => {
    mocks.generateText.mockResolvedValue({
      output: { translations: [entry("1")] },
    })
    const overall = new AbortController()

    await translateBatch({
      model: "model" as never,
      items: [{ id: "1", maskedText: "x" }],
      targetLanguage: "vi",
      signal: overall.signal,
    })

    expect(mocks.generateText.mock.calls[0]?.[0]).toMatchObject({
      abortSignal: overall.signal,
    })
  })
})

describe("toTranslationFailureCode", () => {
  test.each([
    [apiError(429), "rateLimited"],
    [apiError(401), "integrationUnavailable"],
    [apiError(403), "integrationUnavailable"],
    [apiError(500), "providerError"],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
    [new Error("boom"), "providerError"],
  ])("maps %s to %s", (error, code) => {
    expect(toTranslationFailureCode(error)).toBe(code)
  })

  test("an auth failure is not retryable, a rate limit is", () => {
    expect(
      new TranslationProviderError("integrationUnavailable", null).retryable,
    ).toBe(false)
    expect(new TranslationProviderError("rateLimited", null).retryable).toBe(
      true,
    )
  })
})

describe("translateSentence", () => {
  test("asks for plain text (no structured output) and returns it trimmed", async () => {
    mocks.generateText.mockResolvedValue({ text: "  Xin chào ⟦1⟧\n" })

    const text = await translateSentence({
      model: "model" as never,
      maskedText: "Hola ⟦1⟧",
      targetLanguage: "vi",
      targetLanguageName: "Tiếng Việt",
    })

    expect(text).toBe("Xin chào ⟦1⟧")
    expect(mocks.generateText).toHaveBeenCalledTimes(1)
    const call = mocks.generateText.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(call.output).toBeUndefined()
    expect(call.tools).toBeUndefined()
    expect(call.providerOptions).toEqual({ openai: { store: false } })
    expect(call.prompt).toContain("Tiếng Việt (vi)")
    expect(call.prompt).toContain("Hola ⟦1⟧")
  })

  test("maps a provider failure to a TranslationProviderError", async () => {
    mocks.generateText.mockRejectedValue(apiError(429))

    await expect(
      translateSentence({
        model: "model" as never,
        maskedText: "Hola",
        targetLanguage: "vi",
      }),
    ).rejects.toMatchObject({ code: "rateLimited" })
  })
})

describe("translationProviderOptions", () => {
  const model = (provider: string, modelId: string) =>
    ({ provider, modelId }) as never

  test("always asks OpenAI not to store the response", () => {
    expect(
      translationProviderOptions(model("openai.responses", "gpt-4.1")),
    ).toEqual({
      openai: { store: false },
    })
    expect(translationProviderOptions("some-model" as never)).toEqual({
      openai: { store: false },
    })
  })

  test.each([
    ["gemini-3.5-flash", "minimal"],
    ["gemini-3.6-flash", "minimal"],
    ["gemini-3.7-flash", "low"],
    ["gemini-3.8-flash", "low"],
  ])("%s thinks at its lowest accepted level (%s)", (modelId, level) => {
    expect(
      translationProviderOptions(model("google.generative-ai", modelId)),
    ).toEqual({
      openai: { store: false },
      google: { thinkingConfig: { thinkingLevel: level } },
    })
  })

  test.each([
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-9-flash",
  ])("%s gets no thinking option (it would be rejected or is not needed)", (modelId) => {
    expect(
      translationProviderOptions(model("google.generative-ai", modelId)),
    ).toEqual({ openai: { store: false } })
  })

  test("another provider's model with a Gemini-looking id is left alone", () => {
    expect(
      translationProviderOptions(model("openrouter", "gemini-3.5-flash")),
    ).toEqual({ openai: { store: false } })
  })
})
