import type {
  AIAgentModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { type ModelMessage, streamText } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { resolveAdContextPrompt } from "../src/integration/handlers/automated-response/ad-context"
import { replyByAI } from "../src/integration/handlers/automated-response/replies"
import { runAgentReply } from "../src/integration/handlers/automated-response/run-agent-reply"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

type LatestMetaAdTouch = {
  occurredAt: Date
  sourceUrl: string | null
  metadata: {
    adTitle?: string | null
    adBody?: string | null
    sourcePlatform?: string | null
  } | null
}

const findLatestMetaAdTouchMock = vi.hoisted(() =>
  vi.fn<() => Promise<LatestMetaAdTouch | null>>(async () => null),
)
const warnMock = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/business", () => ({
  flowService: { findBy: vi.fn() },
  integrationOpenaiCompatibleService: {
    findByWorkspaceIdAndId: vi.fn(),
  },
  defaultReplyThrottleService: {
    tryAcquire: vi.fn(async () => ({ result: "bypassed" })),
    release: vi.fn(async () => undefined),
  },
  contactReferralEventService: {
    findLatestMetaAdTouch: findLatestMetaAdTouchMock,
  },
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    integrationQueue: { add: vi.fn(async () => undefined) },
    chatQueue: { add: vi.fn(async () => undefined) },
  }
})

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "webhook",
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// The guards append a marker so the tests can prove the ad block lands before
// every guard (the guards must keep the last word).
vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: { openai: "openai" },
  aiTimeouts: {
    aiTotal: 30_000,
    aiStep: 10_000,
    aiFirstChunk: 5000,
    aiChunk: 5000,
  },
  helpTexts: {
    fallbackLookup:
      "I've found some data, but I couldn't generate a complete answer yet.",
    unavailable: "Sorry, I cannot help right now.",
  },
  processStreamingText: vi.fn(async () => ({ fullText: "", messageCount: 0 })),
  systemFunctionNames: {
    webSearch: "webSearch",
    connectUserToHuman: "connectUserToHuman",
    documentReader: "documentReader",
    imageReader: "imageReader",
    urlReader: "urlReader",
  },
  toolPrefixes: { enum: { sys: "sys", file: "file", fn: "fn", mcp: "mcp" } },
  toFinalStepTextStream: vi.fn((stream: unknown) => stream),
  toStepSeparatedTextStream: vi.fn((stream: unknown) => stream),
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiContextService: { appendHistory: vi.fn(async () => undefined) },
  appendAIAgentActionToolProtocol: (p: string) => p,
  appendCustomerInputGuard: (p: string) => p,
  appendFabricationGuard: (p: string) => p,
  appendHandoffPolicy: (p: string) => p,
  appendKnowledgeBaseGuard: (p: string) => p,
  appendToolOutputGuard: (p: string) => `${p}\n[TOOL_OUTPUT_GUARD]`,
  appendUnavailableWebSearchPolicy: (p: string) => p,
  createAIProviderInstance: vi.fn(() => () => ({ type: "fake-model" })),
  createOpenaiCompatibleModelInstance: vi.fn(() => ({
    type: "openai-compatible-model",
  })),
  getAIIntegrationInDB: vi.fn(async () => ({
    id: "integration-1",
    apiKey: "key",
  })),
  getAIToolset: vi.fn(async () => ({
    tools: { some_tool: {} },
    cleanup: undefined,
    webSearchOmitReason: undefined,
  })),
  McpClient: vi.fn(),
  normalizeAuthorizedWebSearchDomains: vi.fn(() => []),
  normalizeMcpContent: vi.fn((c: unknown) => c),
}))

async function* emptyAsyncIterable() {
  // intentionally empty: fake textStream for tests
}

vi.mock("ai", () => ({
  streamText: vi.fn((opts: { onStepEnd?: (info: unknown) => void }) => {
    opts.onStepEnd?.({
      stepNumber: 0,
      finishReason: "tool-calls",
      rawFinishReason: "tool-calls",
      content: [{ type: "tool-call" }, { type: "tool-result" }],
      toolCalls: [{ toolName: "some_tool" }],
      toolResults: [{}],
    })
    return Promise.resolve({
      textStream: emptyAsyncIterable(),
      usage: Promise.resolve({ totalTokens: 0 }),
    })
  }),
  isStepCount: vi.fn(() => () => false),
}))

vi.mock("../src/integration/utils/message", () => ({
  sendMessageAndWait: vi.fn(async () => undefined),
  sendMessageWithRender: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(async () => []),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))

vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: vi.fn(async () => undefined) },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(async () => undefined),
}))

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/document-reader",
  () => ({ createDocumentReaderExecutor: vi.fn(() => vi.fn()) }),
)
vi.mock(
  "../src/integration/handlers/automated-response/system-tools/image-reader",
  () => ({ createImageReaderExecutor: vi.fn(() => vi.fn()) }),
)
vi.mock(
  "../src/integration/handlers/automated-response/system-tools/url-reader",
  () => ({ createUrlReaderExecutor: vi.fn(() => vi.fn()) }),
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000

const whatsappAdReferral = {
  ctwaClid: "ctwa-click-1",
  adId: "ad-1",
  adTitle: "Khoa IELTS 6.5",
  adBody: "Hoc thu mien phi",
  sourceUrl: "https://fb.me/ielts",
  sourcePlatform: "facebook",
}

/** A logged touch of `whatsappAdReferral`, `ageMs` before now. */
function touchAgo(
  ageMs: number,
  copy: {
    adTitle?: string | null
    adBody?: string | null
    sourcePlatform?: string | null
    sourceUrl?: string | null
  } = whatsappAdReferral,
): LatestMetaAdTouch {
  return {
    occurredAt: new Date(Date.now() - ageMs),
    sourceUrl: copy.sourceUrl ?? null,
    metadata: {
      adTitle: copy.adTitle ?? null,
      adBody: copy.adBody ?? null,
      sourcePlatform: copy.sourcePlatform ?? null,
    },
  }
}

function makeAIAgent(overrides?: Partial<AIAgentModel>): AIAgentModel {
  return {
    id: "agent-1",
    workspaceId: "ws-1",
    name: "Test Agent",
    prompt: "You are a helpful assistant.",
    messages: [],
    isDefault: false,
    isRichResponse: false,
    tools: ["sys:some_tool"],
    webSearchAuthorizedDomains: [],
    models: [{ provider: "openai", model: "gpt-4o" }] as AIAgentModel["models"],
    temperature: 0.7,
    maxOutputTokens: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AIAgentModel
}

function makeConversation(): ConversationModel {
  return {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    channel: "whatsapp",
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ConversationModel
}

function makeContactInbox(
  referral?: Record<string, unknown> | null,
): ContactInboxModel {
  return {
    id: "inbox-1",
    contactId: "contact-1",
    inboxId: "channel-inbox-1",
    channel: "whatsapp",
    referral: referral ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ContactInboxModel
}

function makeProps(contactInbox: ContactInboxModel) {
  return {
    conversation: makeConversation(),
    contactInbox,
    channel: "whatsapp",
    messages: [] as ModelMessage[],
    fileOnlyTrigger: false,
    triggerMessageId: "msg-trigger-1",
    defaultReplyFrequency: "allTime" as const,
  }
}

function lastInstructions(): string {
  const options: { instructions?: unknown } | undefined = vi
    .mocked(streamText)
    .mock.calls.at(-1)?.[0]
  return typeof options?.instructions === "string" ? options.instructions : ""
}

beforeEach(() => {
  findLatestMetaAdTouchMock.mockReset().mockResolvedValue(null)
  warnMock.mockClear()
  vi.mocked(streamText).mockClear()
})

// ---------------------------------------------------------------------------
// resolveAdContextPrompt
// ---------------------------------------------------------------------------

describe("resolveAdContextPrompt", () => {
  const conversation = makeConversation()

  test("returns the block for a paid-ad customer whose click is recent", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(HOUR_MS))

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toContain("Ad context:")
    expect(prompt).toContain('Headline: "Khoa IELTS 6.5"')
    expect(findLatestMetaAdTouchMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInboxId: "inbox-1",
    })
  })

  test("a Click-to-WhatsApp click without an ad id still gets the block", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(HOUR_MS))

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox({
        ...whatsappAdReferral,
        adId: null,
      }),
      conversation,
    })

    expect(prompt).toContain("Ad context:")
    expect(prompt).toContain('Headline: "Khoa IELTS 6.5"')
  })

  test("an organic customer costs no lookup and gets no block", async () => {
    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(null),
      conversation,
    })

    expect(prompt).toBeNull()
    expect(findLatestMetaAdTouchMock).not.toHaveBeenCalled()
  })

  test("an ig.me shortlink referral is not a paid ad", async () => {
    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox({
        adId: "ad-1",
        source: "SHORTLINK",
        adTitle: "Not an ad",
      }),
      conversation,
    })

    expect(prompt).toBeNull()
    expect(findLatestMetaAdTouchMock).not.toHaveBeenCalled()
  })

  test("a click older than 72 hours gets no block", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(73 * HOUR_MS))

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toBeNull()
  })

  test("a referral that was never logged gets no block", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(null)

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toBeNull()
  })

  test("a paid ad with only an ad id costs no lookup and gets no block", async () => {
    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox({ adId: "ad-1", source: "ADS" }),
      conversation,
    })

    expect(prompt).toBeNull()
    expect(findLatestMetaAdTouchMock).not.toHaveBeenCalled()
  })

  test("a logged touch without any copy gets no block", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(
      touchAgo(HOUR_MS, { sourcePlatform: "facebook" }),
    )

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toBeNull()
  })

  test("a touch a few seconds ahead of our clock still gets the block", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(-5000))

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toContain("Ad context:")
  })

  test("a touch far in the future gets no block", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(-48 * HOUR_MS))

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toBeNull()
  })

  test("a newer ad B in the log wins over ad A still in the snapshot", async () => {
    // Out-of-order webhooks: B (newer Meta timestamp) was processed first, so
    // the last-write-wins snapshot holds A while the log's newest touch is B.
    findLatestMetaAdTouchMock.mockResolvedValue(
      touchAgo(HOUR_MS, {
        adTitle: "Ad B headline",
        adBody: "Ad B body",
        sourceUrl: "https://fb.me/ad-b",
        sourcePlatform: "instagram",
      }),
    )

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toContain('Headline: "Ad B headline"')
    expect(prompt).toContain('Link: "https://fb.me/ad-b"')
    expect(prompt).toContain('Platform: "instagram"')
    expect(prompt).not.toContain("Khoa IELTS 6.5")
    expect(prompt).not.toContain("https://fb.me/ielts")
  })

  test("a snapshot ahead of the log never pairs B's copy with A's time", async () => {
    // The snapshot moved to B but B's touch write failed (it is contained):
    // the newest logged touch is A, still inside the window.
    findLatestMetaAdTouchMock.mockResolvedValue(
      touchAgo(10 * HOUR_MS, {
        adTitle: "Ad A headline",
        sourceUrl: "https://fb.me/ad-a",
      }),
    )

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox({
        ctwaClid: "ctwa-click-b",
        adId: "ad-b",
        adTitle: "Ad B headline",
        sourceUrl: "https://fb.me/ad-b",
      }),
      conversation,
    })

    expect(prompt).toContain('Headline: "Ad A headline"')
    expect(prompt).not.toContain("Ad B headline")
    expect(prompt).not.toContain("https://fb.me/ad-b")
  })

  test("a Click-to-WhatsApp click without an ad id does not reuse the previous ad's copy", async () => {
    // The merged snapshot keeps the previous ad's headline (no ad id, so the
    // merge does not clear it); the new touch only carries a body.
    findLatestMetaAdTouchMock.mockResolvedValue(
      touchAgo(HOUR_MS, { adBody: "New ad body" }),
    )

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox({
        ...whatsappAdReferral,
        ctwaClid: "ctwa-click-2",
        adBody: "New ad body",
      }),
      conversation,
    })

    expect(prompt).toContain('Text: "New ad body"')
    expect(prompt).not.toContain("Headline:")
    expect(prompt).not.toContain("Khoa IELTS 6.5")
  })

  test("a new ad without a link does not reuse the previous ad's link", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(
      touchAgo(HOUR_MS, { adTitle: "New ad", sourceUrl: null }),
    )

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox({
        ...whatsappAdReferral,
        adId: "ad-2",
        adTitle: "New ad",
      }),
      conversation,
    })

    expect(prompt).toContain('Headline: "New ad"')
    expect(prompt).not.toContain("Link:")
    expect(prompt).not.toContain("https://fb.me/ielts")
  })

  test("a failing lookup degrades to no block and logs a warning", async () => {
    findLatestMetaAdTouchMock.mockRejectedValue(new Error("db down"))

    const prompt = await resolveAdContextPrompt({
      contactInbox: makeContactInbox(whatsappAdReferral),
      conversation,
    })

    expect(prompt).toBeNull()
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        reason: "ad_context_unavailable",
      }),
      expect.any(String),
    )
  })
})

// ---------------------------------------------------------------------------
// Prompt assembly in the AI Agent chat reply
// ---------------------------------------------------------------------------

describe("AI Agent chat prompt with ad context", () => {
  test("adds the ad block after the workspace prompt and before the guards", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(HOUR_MS))

    await replyByAI({
      ...makeProps(makeContactInbox(whatsappAdReferral)),
      aiAgent: makeAIAgent(),
    })

    const instructions = lastInstructions()
    const promptAt = instructions.indexOf("You are a helpful assistant.")
    const adAt = instructions.indexOf("Ad context:")
    const guardAt = instructions.indexOf("[TOOL_OUTPUT_GUARD]")

    expect(promptAt).toBeGreaterThanOrEqual(0)
    expect(adAt).toBeGreaterThan(promptAt)
    expect(guardAt).toBeGreaterThan(adAt)
    expect(instructions).toContain('Headline: "Khoa IELTS 6.5"')
  })

  test("keeps the conversation summary in front of the ad block", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(HOUR_MS))

    await replyByAI({
      ...makeProps(makeContactInbox(whatsappAdReferral)),
      aiAgent: makeAIAgent(),
      summary: "Customer asked about a course earlier.",
    })

    const instructions = lastInstructions()
    expect(instructions.indexOf("Conversation Context:")).toBeLessThan(
      instructions.indexOf("Ad context:"),
    )
  })

  test("an agent without a prompt does not start with blank lines", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(HOUR_MS))

    await replyByAI({
      ...makeProps(makeContactInbox(whatsappAdReferral)),
      aiAgent: makeAIAgent({ prompt: "" }),
    })

    expect(lastInstructions().startsWith("Ad context:")).toBe(true)
  })

  test("the Default Agent and Global Router seam (runAgentReply) adds it too", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(HOUR_MS))

    await runAgentReply({
      ...makeProps(makeContactInbox(whatsappAdReferral)),
      aiAgent: makeAIAgent(),
    })

    expect(lastInstructions()).toContain("Ad context:")
  })

  test("an organic customer's prompt is unchanged and no lookup happens", async () => {
    await replyByAI({
      ...makeProps(makeContactInbox(null)),
      aiAgent: makeAIAgent(),
    })

    expect(lastInstructions()).toBe(
      "You are a helpful assistant.\n[TOOL_OUTPUT_GUARD]",
    )
    expect(findLatestMetaAdTouchMock).not.toHaveBeenCalled()
  })

  test("a stale click leaves the prompt unchanged", async () => {
    findLatestMetaAdTouchMock.mockResolvedValue(touchAgo(100 * HOUR_MS))

    await replyByAI({
      ...makeProps(makeContactInbox(whatsappAdReferral)),
      aiAgent: makeAIAgent(),
    })

    expect(lastInstructions()).not.toContain("Ad context:")
  })

  test("a failing lookup still produces a reply, without the block", async () => {
    findLatestMetaAdTouchMock.mockRejectedValue(new Error("db down"))

    const result = await replyByAI({
      ...makeProps(makeContactInbox(whatsappAdReferral)),
      aiAgent: makeAIAgent(),
    })

    expect(result).not.toBeNull()
    expect(streamText).toHaveBeenCalled()
    expect(lastInstructions()).not.toContain("Ad context:")
  })
})
