import type { MessageForTranslation } from "@chatbotx.io/database/repositories"
import type { MessageTranslationModel } from "@chatbotx.io/database/types"
import { describe, expect, test } from "vitest"
import { classifyTranslationRequest } from "../src/translation/request-guard"

const AFTER = new Date("2026-11-10T00:00:00.000Z")

const message = (
  overrides: Partial<MessageForTranslation> = {},
): MessageForTranslation => ({
  id: "m1",
  createdAt: AFTER,
  conversationId: "c1",
  contactInboxId: "ci1",
  direction: "incoming",
  type: "message",
  contentType: "text",
  text: "quiero cambiar la talla",
  deletedAt: null,
  ...overrides,
})

const row = (
  overrides: Partial<MessageTranslationModel> = {},
): MessageTranslationModel =>
  ({
    id: "t1",
    messageId: "m1",
    direction: "inbound",
    status: "translated",
    targetLanguage: "vi",
    ...overrides,
  }) as MessageTranslationModel

const classify = (
  options: {
    messages?: MessageForTranslation[]
    translations?: MessageTranslationModel[]
    retryFailed?: boolean
    availability?: "ok" | "disabled" | "unavailable"
    workspaceLanguage?: string
    ids?: string[]
  } = {},
) =>
  classifyTranslationRequest({
    conversationId: "c1",
    refs: (options.ids ?? ["m1"]).map((id) => ({ id, createdAt: AFTER })),
    messages: options.messages ?? [message()],
    translations: options.translations ?? [],
    workspaceLanguage: options.workspaceLanguage ?? "vi",
    retryFailed: options.retryFailed ?? false,
    availability: options.availability ?? "ok",
  })

const reasonOf = (decisions: ReturnType<typeof classify>) => {
  const [first] = decisions
  return first && !first.accepted ? first.reason : "accepted"
}

describe("classifyTranslationRequest", () => {
  test("accepts a new inbound direct text message", () => {
    expect(reasonOf(classify())).toBe("accepted")
  })

  test("accepts a message older than when translation was first turned on", () => {
    const old = message({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
    expect(reasonOf(classify({ messages: [old] }))).toBe("accepted")
  })

  test.each([
    ["disabled", "disabled"],
    ["unavailable", "unavailable"],
  ] as const)("%s skips everything with that reason", (availability, reason) => {
    expect(reasonOf(classify({ availability }))).toBe(reason)
  })

  test.each([
    ["a missing message", { messages: [] }, "notFound"],
    [
      "a deleted message",
      { messages: [message({ deletedAt: AFTER })] },
      "notFound",
    ],
    [
      "a message of another conversation",
      { messages: [message({ conversationId: "other" })] },
      "notFound",
    ],
    [
      "a comment",
      { messages: [message({ type: "comment" })] },
      "notDirectText",
    ],
    [
      "a location",
      { messages: [message({ contentType: "location" })] },
      "notDirectText",
    ],
    [
      "an outgoing message",
      { messages: [message({ direction: "outgoing" })] },
      "notInbound",
    ],
    ["an emoji", { messages: [message({ text: "👍" })] }, "noise"],
    [
      "an already translated message",
      { translations: [row()] },
      "alreadyTranslated",
    ],
    [
      "an already skipped message",
      { translations: [row({ status: "skipped" })] },
      "alreadyTranslated",
    ],
    [
      "a failed message without retryFailed",
      { translations: [row({ status: "failed" })] },
      "failed",
    ],
  ])("%s -> %s", (_name, options, reason) => {
    expect(reasonOf(classify(options))).toBe(reason)
  })

  test("accepts a failed message when retryFailed is set", () => {
    expect(
      reasonOf(
        classify({
          translations: [row({ status: "failed" })],
          retryFailed: true,
        }),
      ),
    ).toBe("accepted")
  })

  test.each([
    "translated",
    "skipped",
  ] as const)("accepts a %s row written for another workspace language (stale)", (status) => {
    expect(
      reasonOf(
        classify({
          translations: [row({ status, targetLanguage: "en" })],
        }),
      ),
    ).toBe("accepted")
  })

  test("a row for the same language written as zh-CN is not stale in a zh-Hans workspace", () => {
    expect(
      reasonOf(
        classify({
          workspaceLanguage: "zh-Hans",
          translations: [row({ targetLanguage: "zh-CN" })],
        }),
      ),
    ).toBe("alreadyTranslated")
  })

  test("a duplicated id is classified once", () => {
    expect(classify({ ids: ["m1", "m1"] })).toHaveLength(1)
  })
})
