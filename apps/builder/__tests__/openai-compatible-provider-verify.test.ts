import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  validateBaseUrl: vi.fn(async (baseURL: string) => baseURL.trim()),
}))

vi.mock("ky", () => ({
  default: { get: mocks.get },
  HTTPError: class HTTPError extends Error {},
}))

vi.mock("@chatbotx.io/business", () => ({
  validateOpenaiCompatibleBaseUrlForEnvironment: mocks.validateBaseUrl,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code = "systemError"
    httpStatusCode = 400

    constructor(message: string, code?: string, httpStatusCode?: number) {
      super(message)
      this.name = "ChatbotXException"
      if (code) {
        this.code = code
      }
      if (httpStatusCode) {
        this.httpStatusCode = httpStatusCode
      }
    }
  },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { verifyOpenaiCompatibleProvider } = await import(
  "@/features/integration-openai-compatible/lib"
)

describe("verifyOpenaiCompatibleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateBaseUrl.mockImplementation(async (baseURL: string) =>
      baseURL.trim(),
    )
    mocks.get.mockResolvedValue({})
  })

  test("blocks unsafe base URLs before calling the provider", async () => {
    mocks.validateBaseUrl.mockRejectedValue(
      new ChatbotXException(
        "OpenAI-compatible base URL is not allowed.",
        "ssrfBlocked",
        400,
      ),
    )

    await expect(
      verifyOpenaiCompatibleProvider({
        baseURL: "http://127.0.0.1:1234/v1",
        apiKey: "secret",
      }),
    ).resolves.toEqual({ ok: false, reason: "unsafe_base_url" })
    expect(mocks.get).not.toHaveBeenCalled()
  })

  test("uses the normalized URL when requesting the models endpoint", async () => {
    mocks.validateBaseUrl.mockResolvedValue("https://example.com/v1")

    await expect(
      verifyOpenaiCompatibleProvider({
        baseURL: " https://example.com/v1 ",
        apiKey: "secret",
      }),
    ).resolves.toEqual({ ok: true })

    expect(mocks.get).toHaveBeenCalledWith(
      new URL("https://example.com/v1/models"),
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
      }),
    )
  })
})
