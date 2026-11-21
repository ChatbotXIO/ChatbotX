import { describe, expect, test } from "vitest"
import {
  resolveComposerTranslation,
  willTranslateSend,
} from "@/features/translation/lib/composer-translation"
import {
  needsTranslationRequest,
  resolveMessageTranslationView,
} from "@/features/translation/lib/message-translation-view"
import {
  planRequests,
  requestSignature,
} from "@/features/translation/lib/request-batches"

const translation = (overrides: Record<string, unknown> = {}) => ({
  direction: "inbound" as const,
  status: "translated" as const,
  displayText: "Tôi muốn đổi size áo",
  sourceLanguage: "es",
  targetLanguage: "vi",
  failureCode: null,
  ...overrides,
})

const inbound = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  messageType: "incoming" as const,
  type: "message" as const,
  contentType: "text" as const,
  text: "Quiero cambiar la talla",
  deletedAt: null,
  translation: undefined as ReturnType<typeof translation> | null | undefined,
  ...overrides,
})

const view = (
  message: ReturnType<typeof inbound>,
  options: {
    enabled?: boolean
    workspaceLanguage?: string | null
    requestState?: "pending" | "waiting"
  } = {},
) =>
  resolveMessageTranslationView({
    message: message as never,
    enabled: options.enabled ?? true,
    workspaceLanguage:
      options.workspaceLanguage === undefined
        ? "vi"
        : options.workspaceLanguage,
    requestState: options.requestState,
  })

describe("resolveMessageTranslationView (the bubble table)", () => {
  test("translated inbound: the translation first, the original below with its language", () => {
    expect(view(inbound({ translation: translation() }))).toEqual({
      kind: "translated",
      direction: "inbound",
      mainText: "Tôi muốn đổi size áo",
      secondaryText: "Quiero cambiar la talla",
      languageCode: "es",
    })
  })

  test("translated outbound: what the agent typed first, what was sent below", () => {
    const outgoing = inbound({
      messageType: "outgoing",
      text: "Sí, le cambio a talla M",
      translation: translation({
        direction: "outbound",
        displayText: "Dạ, em đổi size M cho anh nhé",
        sourceLanguage: "vi",
        targetLanguage: "es",
      }),
    })

    expect(view(outgoing)).toEqual({
      kind: "translated",
      direction: "outbound",
      mainText: "Dạ, em đổi size M cho anh nhé",
      secondaryText: "Sí, le cambio a talla M",
      languageCode: "es",
    })
  })

  test("an outgoing message with no translation row is a plain bubble", () => {
    expect(view(inbound({ messageType: "outgoing" }))).toEqual({ kind: "none" })
  })

  test.each([
    ["asked for and under 30 s", "pending"],
    ["asked for and over 30 s", "waiting"],
  ] as const)("no row yet, %s -> %s", (_name, requestState) => {
    expect(view(inbound(), { requestState })).toEqual({ kind: requestState })
  })

  test("no row and nothing asked for: a plain bubble", () => {
    expect(view(inbound())).toEqual({ kind: "none" })
  })

  test("a stored failure shows 'failed' with retry", () => {
    expect(
      view(
        inbound({
          translation: translation({ status: "failed", displayText: null }),
        }),
      ),
    ).toEqual({ kind: "failed" })
  })

  test("a retry in progress shows translating, not the old failure", () => {
    expect(
      view(
        inbound({
          translation: translation({ status: "failed", displayText: null }),
        }),
        { requestState: "pending" },
      ),
    ).toEqual({ kind: "pending" })
  })

  test("a skipped row (customer wrote in the workspace language) is a plain bubble", () => {
    expect(
      view(
        inbound({
          translation: translation({ status: "skipped", displayText: null }),
        }),
      ),
    ).toEqual({ kind: "none" })
  })

  test("a row for another workspace language is stale: hidden, and shown as translating once re-asked", () => {
    const stale = inbound({
      translation: translation({ targetLanguage: "en" }),
    })

    expect(view(stale)).toEqual({ kind: "none" })
    expect(view(stale, { requestState: "pending" })).toEqual({
      kind: "pending",
    })
  })

  test("pt-BR and pt-PT are the same language: not stale", () => {
    expect(
      view(inbound({ translation: translation({ targetLanguage: "pt-BR" }) }), {
        workspaceLanguage: "pt-PT",
      }).kind,
    ).toBe("translated")
  })

  test.each([
    ["translation is off", { enabled: false }],
    [
      "the workspace language is unknown but a row exists",
      { workspaceLanguage: null },
    ],
  ])("%s", (_name, options) => {
    const result = view(inbound({ translation: translation() }), options)
    expect(result.kind).toBe(
      "enabled" in options && options.enabled === false ? "none" : "translated",
    )
  })

  test.each([
    ["noise (an emoji)", { text: "👍" }],
    ["a comment", { type: "comment" }],
    ["a location", { contentType: "location" }],
    ["a deleted message", { deletedAt: new Date() }],
    ["no text", { text: null }],
  ])("%s is never translated", (_name, overrides) => {
    expect(view(inbound({ translation: translation(), ...overrides }))).toEqual(
      { kind: "none" },
    )
  })
})

describe("needsTranslationRequest", () => {
  const needs = (
    message: ReturnType<typeof inbound>,
    workspaceLanguage: string | null = "vi",
  ) => needsTranslationRequest({ message: message as never, workspaceLanguage })

  test("an inbound text with no row needs one", () => {
    expect(needs(inbound())).toBe(true)
  })

  test("a stale row needs a new one, even a skipped one", () => {
    expect(
      needs(inbound({ translation: translation({ targetLanguage: "en" }) })),
    ).toBe(true)
    expect(
      needs(
        inbound({
          translation: translation({ status: "skipped", targetLanguage: "en" }),
        }),
      ),
    ).toBe(true)
  })

  test.each([
    ["a current translation", translation()],
    [
      "a current failure (the agent retries by hand)",
      translation({ status: "failed" }),
    ],
    ["a current skipped row", translation({ status: "skipped" })],
  ])("%s does not", (_name, row) => {
    expect(needs(inbound({ translation: row }))).toBe(false)
  })

  test.each([
    ["an outgoing message", { messageType: "outgoing" }],
    ["noise", { text: "ok" }],
    ["a comment", { type: "comment" }],
  ])("%s does not", (_name, overrides) => {
    expect(needs(inbound(overrides))).toBe(false)
  })
})

describe("resolveComposerTranslation (the chip)", () => {
  const base = {
    workspaceEnabled: true,
    conversationEnabled: true,
    language: "es" as string | null,
    workspaceLanguage: "vi" as string | null,
    hasFiles: false,
    isCommentOrPrivateReply: false,
  }

  test.each([
    [
      "translation on, customer in Spanish",
      {},
      { kind: "active", language: "es" },
    ],
    ["language unknown", { language: null }, { kind: "unknownLanguage" }],
    [
      "same language as the workspace",
      { language: "vi" },
      { kind: "sameLanguage", language: "vi" },
    ],
    [
      "conversation turned off",
      { conversationEnabled: false },
      { kind: "off" },
    ],
    [
      "files attached",
      { hasFiles: true },
      { kind: "hasFiles", language: "es" },
    ],
    [
      "a comment or private reply",
      { isCommentOrPrivateReply: true },
      { kind: "hidden" },
    ],
    ["workspace off", { workspaceEnabled: false }, { kind: "hidden" }],
  ])("%s", (_name, overrides, expected) => {
    expect(resolveComposerTranslation({ ...base, ...overrides })).toEqual(
      expected,
    )
  })

  test("a workspace that has it off never shows a chip, even with the other flags set", () => {
    expect(
      resolveComposerTranslation({
        ...base,
        workspaceEnabled: false,
        conversationEnabled: false,
      }),
    ).toEqual({ kind: "hidden" })
  })

  test("only the active state translates the send", () => {
    expect(willTranslateSend({ kind: "active", language: "es" })).toBe(true)
    for (const state of [
      { kind: "hidden" },
      { kind: "unknownLanguage" },
      { kind: "sameLanguage", language: "vi" },
      { kind: "hasFiles", language: "es" },
      { kind: "off", reason: "conversation" },
    ] as const) {
      expect(willTranslateSend(state)).toBe(false)
    }
  })
})

describe("planRequests", () => {
  const candidates = (count: number, signature = "s") =>
    Array.from({ length: count }, (_, i) => ({
      id: `m${i}`,
      createdAt: new Date(),
      signature,
    }))

  test("35 messages are two requests (20 + 15), none left out", () => {
    const batches = planRequests({
      candidates: candidates(35),
      asked: new Map(),
    })

    expect(batches.map((batch) => batch.length)).toEqual([20, 15])
  })

  test("a message already asked for with the same signature is not asked again", () => {
    expect(
      planRequests({ candidates: candidates(3), asked: new Map([["m1", "s"]]) })
        .flat()
        .map((c) => c.id),
    ).toEqual(["m0", "m2"])
  })

  test("an edited message (new text) or a changed workspace language is asked again", () => {
    const asked = new Map([["m0", requestSignature("old text", "vi")]])

    expect(
      planRequests({
        candidates: [
          {
            id: "m0",
            createdAt: new Date(),
            signature: requestSignature("new text", "vi"),
          },
        ],
        asked,
      }),
    ).toHaveLength(1)
    expect(
      planRequests({
        candidates: [
          {
            id: "m0",
            createdAt: new Date(),
            signature: requestSignature("old text", "en"),
          },
        ],
        asked,
      }),
    ).toHaveLength(1)
  })

  test("nothing to ask means no request", () => {
    expect(planRequests({ candidates: [], asked: new Map() })).toEqual([])
  })
})
