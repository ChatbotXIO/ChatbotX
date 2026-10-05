import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  class CallSummaryProviderNotConnectedError extends Error {}
  return {
    CallSummaryProviderNotConnectedError,
    getTranscriptTextForCall: vi.fn(),
    attachSummary: vi.fn(),
    generateCallSummary: vi.fn(),
    listConnectedCallSummaryProviders: vi.fn(),
    runExclusive: vi.fn(),
    isLockAcquisitionError: vi.fn(() => false),
  }
})

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  isLockAcquisitionError: mocks.isLockAcquisitionError,
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  CallSummaryProviderNotConnectedError:
    mocks.CallSummaryProviderNotConnectedError,
  generateCallSummary: mocks.generateCallSummary,
  listConnectedCallSummaryProviders: mocks.listConnectedCallSummaryProviders,
}))
vi.mock("@chatbotx.io/business", () => ({
  whatsappCallSummaryService: { attachSummary: mocks.attachSummary },
  whatsappCallTranscriptService: {
    getTranscriptTextForCall: mocks.getTranscriptTextForCall,
  },
}))

const { generateCallSummaryForCall } = await import(
  "@/features/whatsapp-calls/lib/generate-call-summary"
)

const input = { workspaceId: "ws-1", callId: "call-1", provider: "openai" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isLockAcquisitionError.mockReturnValue(false)
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
})

describe("generateCallSummaryForCall", () => {
  test("summarizes the transcript and saves the result", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("Hello there")
    mocks.generateCallSummary.mockResolvedValueOnce({ summary: "A greeting" })

    const result = await generateCallSummaryForCall(input as never)

    expect(mocks.generateCallSummary).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "openai",
      transcriptText: "Hello there",
    })
    expect(mocks.attachSummary).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
      aiSummary: { summary: "A greeting" },
      provider: "openai",
    })
    expect(result).toEqual({ summary: "A greeting" })
  })

  test("refuses a call without a transcript (422) and never calls the provider", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("   ")

    await expect(
      generateCallSummaryForCall(input as never),
    ).rejects.toMatchObject({
      code: "callTranscriptEmpty",
      httpStatusCode: 422,
    })

    expect(mocks.generateCallSummary).not.toHaveBeenCalled()
    expect(mocks.attachSummary).not.toHaveBeenCalled()
  })

  test("maps a provider that is not connected to a 422 and saves nothing", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("text")
    mocks.generateCallSummary.mockRejectedValueOnce(
      new mocks.CallSummaryProviderNotConnectedError("openai"),
    )

    await expect(
      generateCallSummaryForCall(input as never),
    ).rejects.toMatchObject({
      code: "callSummaryProviderNotConnected",
      httpStatusCode: 422,
    })

    expect(mocks.attachSummary).not.toHaveBeenCalled()
  })

  test("a second request for the same call gets 409 and never reaches the provider", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("text")
    mocks.runExclusive.mockRejectedValueOnce(new Error("lock held"))
    mocks.isLockAcquisitionError.mockReturnValueOnce(true)

    await expect(
      generateCallSummaryForCall(input as never),
    ).rejects.toMatchObject({
      code: "summaryAlreadyGenerating",
      httpStatusCode: 409,
    })

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "whatsapp-call-summary-generate:call-1",
        retryTimeoutInSeconds: 0,
      }),
    )
    expect(mocks.generateCallSummary).not.toHaveBeenCalled()
  })

  test("without a provider it uses the only connected one", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("text")
    mocks.listConnectedCallSummaryProviders.mockResolvedValueOnce([
      { id: "1", provider: "gemini", label: "Gemini" },
    ])
    mocks.generateCallSummary.mockResolvedValueOnce({ summary: "ok" })

    await generateCallSummaryForCall({
      workspaceId: "ws-1",
      callId: "call-1",
    })

    expect(mocks.generateCallSummary).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gemini" }),
    )
    expect(mocks.attachSummary).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gemini" }),
    )
  })

  test("without a provider and none connected it is a 422", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("text")
    mocks.listConnectedCallSummaryProviders.mockResolvedValueOnce([])

    await expect(
      generateCallSummaryForCall({ workspaceId: "ws-1", callId: "call-1" }),
    ).rejects.toMatchObject({
      code: "callSummaryProviderNotConnected",
      httpStatusCode: 422,
    })
    expect(mocks.generateCallSummary).not.toHaveBeenCalled()
  })

  test("without a provider and several connected it asks for one (422)", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("text")
    mocks.listConnectedCallSummaryProviders.mockResolvedValueOnce([
      { id: "1", provider: "openai", label: "OpenAI" },
      { id: "2", provider: "gemini", label: "Gemini" },
    ])

    await expect(
      generateCallSummaryForCall({ workspaceId: "ws-1", callId: "call-1" }),
    ).rejects.toMatchObject({
      code: "callSummaryProviderRequired",
      httpStatusCode: 422,
    })
    expect(mocks.generateCallSummary).not.toHaveBeenCalled()
  })

  test("an explicit provider never looks the connected ones up", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("text")
    mocks.generateCallSummary.mockResolvedValueOnce({ summary: "ok" })

    await generateCallSummaryForCall(input as never)

    expect(mocks.listConnectedCallSummaryProviders).not.toHaveBeenCalled()
  })

  test("lets other provider failures through unchanged", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValueOnce("text")
    mocks.generateCallSummary.mockRejectedValueOnce(new Error("rate limited"))

    await expect(generateCallSummaryForCall(input as never)).rejects.toThrow(
      "rate limited",
    )
  })

  test("propagates a call that is not in the workspace (404) before any AI call", async () => {
    mocks.getTranscriptTextForCall.mockRejectedValueOnce(
      Object.assign(new Error("Call not found"), { code: "notFound" }),
    )

    await expect(
      generateCallSummaryForCall(input as never),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.generateCallSummary).not.toHaveBeenCalled()
  })
})
