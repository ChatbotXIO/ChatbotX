import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { mockPost, mockPostFormData } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockPostFormData: vi.fn(),
}))

vi.mock("../src/lib/http-client", () => ({
  createTelegramClient: () => ({
    post: mockPost,
    postFormData: mockPostFormData,
  }),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = { auth: { secretText: "tok" } }

const flowStep = (stepType: string, asNote?: boolean) =>
  ({
    ctx,
    data: {
      contact: { sourceId: "chat-1" },
      flowId: "flow-1",
      step: {
        id: "step-1",
        stepType,
        mode: "file",
        url: "https://example.com/a.bin",
        buttons: [],
        asNote,
      },
    },
  }) as never

describe("telegram flow steps — media notes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockResolvedValue({ ok: true, result: { message_id: 7 } })
    mockPostFormData.mockResolvedValue({ ok: true, result: { message_id: 8 } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("an audio note goes out as a voice message by URL", async () => {
    const result = await sendFlowStep(flowStep("sendAudio", true))

    expect(mockPost).toHaveBeenCalledWith("sendVoice", {
      json: {
        chat_id: "chat-1",
        voice: "https://example.com/a.bin",
        reply_markup: undefined,
      },
    })
    expect(result).toEqual({ messageIds: ["7"], sentCount: 1 })
  })

  test("audio without asNote still goes out as a file", async () => {
    await sendFlowStep(flowStep("sendAudio"))

    expect(mockPost).toHaveBeenCalledWith("sendAudio", expect.anything())
  })

  test("a video note is fetched and uploaded, since Telegram takes no URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    vi.stubGlobal("fetch", fetchMock)

    const result = await sendFlowStep(flowStep("sendVideo", true))

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/a.bin")
    const [endpoint, form] = mockPostFormData.mock.calls[0] as [
      string,
      FormData,
    ]
    expect(endpoint).toBe("sendVideoNote")
    expect(form.get("chat_id")).toBe("chat-1")
    expect(form.get("video_note")).toBeInstanceOf(Blob)
    expect(form.get("reply_markup")).toBeNull()
    expect(mockPost).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["8"], sentCount: 1 })
  })

  test("a video note larger than the upload cap is refused before upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1]), {
          headers: { "content-length": String(51 * 1024 * 1024) },
        }),
      ),
    )

    await expect(sendFlowStep(flowStep("sendVideo", true))).rejects.toThrow()
    expect(mockPostFormData).not.toHaveBeenCalled()
  })
})
