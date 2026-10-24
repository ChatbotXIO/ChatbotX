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
const verifyMiniAppResumeToken = vi.fn()
vi.mock("@chatbotx.io/encryption/mini-app-token", () => ({
  verifyMiniAppToken,
  verifyMiniAppResumeToken,
}))

const enqueueFlowAction = vi.fn()
const isActiveNow = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    findById: vi.fn(() => Promise.resolve({ id: "ws-1" })),
    isActiveNow,
  },
}))
vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: { enqueueFlowAction },
}))

// Stands in for Redis `SET NX`: true only the first time a key is set.
const resumedKeys = new Set<string>()
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    setNumberIfNotExists: vi.fn((key: string) => {
      const isNew = !resumedKeys.has(key)
      resumedKeys.add(key)
      return Promise.resolve(isNew)
    }),
    delete: vi.fn((key: string) => {
      resumedKeys.delete(key)
      return Promise.resolve()
    }),
  },
}))

vi.mock("@/lib/log", () => ({ logger: { error: vi.fn() } }))

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
  resumedKeys.clear()
  // Like the real verifier: anything not signed as a resume token is rejected.
  verifyMiniAppResumeToken.mockRejectedValue(new Error("not a resume token"))
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

describe("submitMiniAppAction — continuing the flow", () => {
  const resumePayload = {
    workspaceId: "ws-1",
    contactId: "c-1",
    miniAppId: "10",
    conversationId: "conv-1",
    contactInboxId: "ci-1",
    buttonPayload: "flow-1:fv-1:btn-1::::",
  }

  beforeEach(() => {
    verifyMiniAppToken.mockResolvedValue({
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    isActiveNow.mockReturnValue(true)
    enqueueFlowAction.mockResolvedValue(true)
  })

  const resumeInput = {
    miniAppId: "10",
    token: "tok",
    resume: "resume-1",
    answers: {},
  }

  test("a bot that is off does not continue, and a later submit still can", async () => {
    verifyMiniAppResumeToken.mockResolvedValue(resumePayload)
    isActiveNow.mockReturnValueOnce(false)
    await submit(resumeInput)
    expect(createSubmission).toHaveBeenCalledOnce()
    expect(enqueueFlowAction).not.toHaveBeenCalled()

    await submit(resumeInput)
    expect(enqueueFlowAction).toHaveBeenCalledOnce()
  })

  test("a job that could not be queued leaves the token usable for the next submit", async () => {
    verifyMiniAppResumeToken.mockResolvedValue(resumePayload)
    enqueueFlowAction.mockResolvedValueOnce(false)
    await submit(resumeInput)
    await submit(resumeInput)
    expect(enqueueFlowAction).toHaveBeenCalledTimes(2)
  })

  test("a valid resume token replays the flow button as a tap", async () => {
    verifyMiniAppResumeToken.mockResolvedValue(resumePayload)
    await submit({
      miniAppId: "10",
      token: "tok",
      resume: "resume-1",
      answers: {},
    })
    expect(enqueueFlowAction).toHaveBeenCalledWith({
      kind: "postback",
      data: {
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        action: "flow-1:fv-1:btn-1::::",
      },
    })
  })

  test("submitting again does not continue the flow a second time", async () => {
    verifyMiniAppResumeToken.mockResolvedValue(resumePayload)
    const input = {
      miniAppId: "10",
      token: "tok",
      resume: "resume-1",
      answers: {},
    }
    await submit(input)
    await submit(input)
    expect(createSubmission).toHaveBeenCalledTimes(2)
    expect(enqueueFlowAction).toHaveBeenCalledOnce()
  })

  test.each([
    ["another contact", { contactId: "c-9" }],
    ["another Mini App", { miniAppId: "11" }],
    ["another workspace", { workspaceId: "ws-other" }],
  ])("a resume token signed for %s is ignored", async (_label, override) => {
    verifyMiniAppResumeToken.mockResolvedValue({
      ...resumePayload,
      ...override,
    })
    await submit({
      miniAppId: "10",
      token: "tok",
      resume: "resume-1",
      answers: {},
    })
    expect(createSubmission).toHaveBeenCalledOnce()
    expect(enqueueFlowAction).not.toHaveBeenCalled()
  })

  test("an anonymous visitor cannot continue a flow", async () => {
    verifyMiniAppResumeToken.mockResolvedValue(resumePayload)
    await submit({ miniAppId: "10", resume: "resume-1", answers: {} })
    expect(enqueueFlowAction).not.toHaveBeenCalled()
  })

  test("an invalid resume token still saves the submission", async () => {
    verifyMiniAppResumeToken.mockRejectedValue(new Error("bad token"))
    await expect(
      submit({ miniAppId: "10", token: "tok", resume: "bad", answers: {} }),
    ).resolves.toEqual({ success: true })
    expect(enqueueFlowAction).not.toHaveBeenCalled()
  })
})

describe("submitMiniAppAction — a Messenger template's resume token as `token`", () => {
  const resumePayload = {
    workspaceId: "ws-1",
    contactId: "c-1",
    miniAppId: "10",
    conversationId: "conv-1",
    contactInboxId: "ci-1",
    buttonPayload: "flow-1:fv-1:btn-1::::",
  }

  beforeEach(() => {
    verifyMiniAppToken.mockRejectedValue(new Error("not a contact token"))
    isActiveNow.mockReturnValue(true)
    enqueueFlowAction.mockResolvedValue(true)
  })

  test("attributes the answers to its contact and continues the flow once", async () => {
    verifyMiniAppResumeToken.mockResolvedValue(resumePayload)
    const input = { miniAppId: "10", token: "resume-as-token", answers: {} }

    await submit(input)
    await submit(input)

    expect(createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "c-1" }),
    )
    expect(enqueueFlowAction).toHaveBeenCalledOnce()
    expect(enqueueFlowAction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "flow-1:fv-1:btn-1::::" }),
      }),
    )
  })

  test("is not accepted for another Mini App", async () => {
    verifyMiniAppResumeToken.mockResolvedValue({
      ...resumePayload,
      miniAppId: "11",
    })

    await submit({ miniAppId: "10", token: "resume-as-token", answers: {} })

    expect(createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: null }),
    )
    expect(enqueueFlowAction).not.toHaveBeenCalled()
  })

  test("a contact token as `token` never continues a flow", async () => {
    verifyMiniAppToken.mockResolvedValue({
      workspaceId: "ws-1",
      contactId: "c-1",
    })

    await submit({ miniAppId: "10", token: "contact-token", answers: {} })

    expect(createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "c-1" }),
    )
    expect(enqueueFlowAction).not.toHaveBeenCalled()
  })
})
