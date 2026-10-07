import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/safe-action", () => ({
  actionClient: {
    inputSchema: () => ({
      action: (handler: unknown) => handler,
    }),
  },
}))

const findUnscoped = vi.fn()
const createSubmission = vi.fn()
vi.mock("@chatbotx.io/business/mini-app", () => ({
  miniAppService: { findUnscoped },
  miniAppSubmissionService: { create: createSubmission },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
}))

const verifyMiniAppToken = vi.fn()
vi.mock("@chatbotx.io/encryption/mini-app-token", () => ({
  verifyMiniAppToken,
}))

const loadServableWorkspace = vi.fn()
vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))

const checkGuestRateLimit = vi.fn()
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit,
  resolveGuestRateLimitKey: (_headers: Headers, fallback: string) => fallback,
}))

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { submitMiniAppAction } = await import(
  "../src/features/mini-apps/actions/submit-mini-app.action"
)

type Handler = (props: { parsedInput: unknown }) => Promise<unknown>
const submit = (parsedInput: unknown) =>
  (submitMiniAppAction as unknown as Handler)({ parsedInput })

const miniApp = {
  id: "10",
  workspaceId: "ws-1",
  enabled: true,
  definition: { screens: [] },
}

beforeEach(() => {
  vi.clearAllMocks()
  findUnscoped.mockResolvedValue(miniApp)
  loadServableWorkspace.mockResolvedValue({ servable: true })
  checkGuestRateLimit.mockResolvedValue({ limited: false })
  createSubmission.mockResolvedValue({ id: "s1" })
})

describe("submitMiniAppAction", () => {
  test("attributes the answers to the contact in a valid token", async () => {
    verifyMiniAppToken.mockResolvedValue({
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    await submit({ miniAppId: "10", token: "tok", answers: { a: 1 } })
    expect(createSubmission).toHaveBeenCalledWith({
      miniApp,
      contactId: "c-1",
      answers: { a: 1 },
    })
  })

  test("ignores a token signed for another workspace", async () => {
    verifyMiniAppToken.mockResolvedValue({
      workspaceId: "ws-other",
      contactId: "c-9",
    })
    await submit({ miniAppId: "10", token: "tok", answers: {} })
    expect(createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: null }),
    )
  })

  test("an invalid token submits anonymously", async () => {
    verifyMiniAppToken.mockRejectedValue(new Error("bad token"))
    await submit({ miniAppId: "10", token: "tok", answers: {} })
    expect(createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: null }),
    )
  })

  test("a disabled Mini App or unservable workspace is rejected", async () => {
    findUnscoped.mockResolvedValueOnce({ ...miniApp, enabled: false })
    await expect(
      submit({ miniAppId: "10", answers: {} }),
    ).rejects.toMatchObject({ code: "notFound" })
    loadServableWorkspace.mockResolvedValueOnce({ servable: false })
    await expect(
      submit({ miniAppId: "10", answers: {} }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(createSubmission).not.toHaveBeenCalled()
  })

  test("rate-limited visitors cannot submit", async () => {
    checkGuestRateLimit.mockResolvedValue({ limited: true })
    await expect(
      submit({ miniAppId: "10", answers: {} }),
    ).rejects.toMatchObject({ code: "rateLimited" })
    expect(createSubmission).not.toHaveBeenCalled()
  })
})
