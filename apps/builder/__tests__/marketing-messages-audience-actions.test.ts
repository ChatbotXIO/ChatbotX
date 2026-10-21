// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const TOS_URL_PATTERN = /customaudiences\/tos/

class ChatbotXException extends Error {
  code: string
  data?: Record<string, string | number>
  constructor(message: string, code = "systemError") {
    super(message)
    this.code = code
  }
}

const serviceCreate = vi.fn()
const serviceUploadMore = vi.fn()
const serviceDelete = vi.fn()
const findByPageId = vi.fn()
const getMarketingMessagesAdAccounts = vi.fn()

const validGrant = {
  state: "valid",
  accessToken: "TOKEN",
  version: "v25.0",
  facebookUserId: "asuid",
}

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: { findByPageId },
}))
vi.mock("@chatbotx.io/business/facebook-marketing-message-audience", () => ({
  facebookMarketingMessageAudienceService: {
    create: serviceCreate,
    uploadMore: serviceUploadMore,
    delete: serviceDelete,
  },
  isAudienceError: (error: unknown) =>
    error instanceof ChatbotXException && error.code.startsWith("audience"),
}))
vi.mock("@chatbotx.io/business/errors", () => ({ ChatbotXException }))
vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  getMarketingMessagesAdAccounts,
}))
vi.mock("@/features/facebook-marketing-messages/lib/grant", () => ({
  requireValidGrant: vi.fn(() => Promise.resolve(validGrant)),
}))
vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (handler: unknown) => handler }),
    }),
  },
}))
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
    ),
}))

const { createAudience } = await import(
  "@/features/facebook-marketing-messages/lib/audience-operations"
)
const { uploadMoreAudience } = await import(
  "@/features/facebook-marketing-messages/lib/audience-operations"
)
const { createAudienceSchema, uploadMoreAudienceSchema } = await import(
  "@/features/facebook-marketing-messages/schema/audience"
)

const workspace = { id: "w1" } as never
const file = new File(["email\na@b.co\n"], "list.csv", { type: "text/csv" })
const input = {
  adAccountId: "act_9",
  pageId: "page_1",
  name: "VIP",
  description: "",
  file,
}

beforeEach(() => {
  vi.clearAllMocks()
  getMarketingMessagesAdAccounts.mockResolvedValue([
    {
      id: "act_9",
      accountId: "9",
      currency: "USD",
      tosAccepted: { custom_audience_tos: 1 },
    },
  ])
  findByPageId.mockResolvedValue({ id: "integration" })
  serviceCreate.mockResolvedValue({
    id: "row_1",
    customAudienceId: "aud_1",
    received: 1,
    skipped: 0,
    invalid: 0,
  })
})

describe("createAudience", () => {
  test("passes the grant, file buffer, and a null empty description to the service", async () => {
    await expect(createAudience({ workspace, input })).resolves.toMatchObject({
      status: "ok",
      received: 1,
    })
    const call = serviceCreate.mock.calls[0]?.[0]
    expect(call).toMatchObject({
      workspaceId: "w1",
      grant: validGrant,
      adAccountId: "act_9",
      pageId: "page_1",
      name: "VIP",
      description: null,
    })
    expect(call.file.fileName).toBe("list.csv")
    expect(Buffer.isBuffer(call.file.buffer)).toBe(true)
  })

  test("reports an ad account whose ToS is not accepted as invalid, with the link", async () => {
    getMarketingMessagesAdAccounts.mockResolvedValue([
      { id: "act_9", accountId: "9", currency: "USD", tosAccepted: {} },
    ])
    const outcome = await createAudience({ workspace, input })
    expect(outcome).toMatchObject({ status: "invalid" })
    expect(JSON.stringify(outcome)).toMatch(TOS_URL_PATTERN)
    expect(serviceCreate).not.toHaveBeenCalled()
  })

  test("reports an ad account not visible to the grant as invalid", async () => {
    getMarketingMessagesAdAccounts.mockResolvedValue([])
    await expect(createAudience({ workspace, input })).resolves.toEqual({
      status: "invalid",
      message: "facebookMarketingMessages.errors.notGranted",
    })
  })

  test("reports a Page that is not connected as invalid", async () => {
    findByPageId.mockResolvedValue(null)
    await expect(createAudience({ workspace, input })).resolves.toEqual({
      status: "invalid",
      message: "facebookMarketingMessages.audiences.errors.pageNotConnected",
    })
    expect(findByPageId).toHaveBeenCalledWith({
      workspaceId: "w1",
      pageId: "page_1",
    })
    expect(serviceCreate).not.toHaveBeenCalled()
  })

  test("a pre-creation service error is returned as invalid", async () => {
    serviceCreate.mockRejectedValue(
      new ChatbotXException("audienceNoIdentifier", "audienceNoIdentifier"),
    )
    await expect(createAudience({ workspace, input })).resolves.toEqual({
      status: "invalid",
      message:
        "facebookMarketingMessages.audiences.errors.audienceNoIdentifier",
    })
  })

  test("a Graph rejection of the create is returned as invalid with Meta's reason", async () => {
    const error = new ChatbotXException(
      "audienceCreateRejected",
      "audienceCreateRejected",
    ) as ChatbotXException & { data: Record<string, string | number> }
    error.data = { reason: "(#100) Invalid parameter" }
    serviceCreate.mockRejectedValue(error)
    await expect(createAudience({ workspace, input })).resolves.toEqual({
      status: "invalid",
      message:
        'facebookMarketingMessages.audiences.errors.audienceCreateRejected {"reason":"(#100) Invalid parameter"}',
    })
  })

  test("a partial upload is returned as partial with its count and message", async () => {
    const error = new ChatbotXException(
      "audiencePartialUpload",
      "audiencePartialUpload",
    )
    error.data = { received: 10_000 }
    serviceCreate.mockRejectedValue(error)
    await expect(createAudience({ workspace, input })).resolves.toEqual({
      status: "partial",
      received: 10_000,
      message:
        'facebookMarketingMessages.audiences.errors.audiencePartialUpload {"received":10000}',
    })
  })

  test("an unmapped service error still throws (client treats it as uncertain)", async () => {
    serviceCreate.mockRejectedValue(new Error("boom"))
    await expect(createAudience({ workspace, input })).rejects.toThrow("boom")
  })
})

describe("uploadMoreAudience", () => {
  test("passes the grant and workspace id from context", async () => {
    serviceUploadMore.mockResolvedValue({ id: "row_1" })
    await expect(
      uploadMoreAudience({ workspace, input: { id: "row_1", file } }),
    ).resolves.toMatchObject({ status: "ok", id: "row_1" })
    expect(serviceUploadMore).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        grant: validGrant,
        id: "row_1",
      }),
    )
  })
})

describe("audience file schema", () => {
  const parse = (f: File) =>
    createAudienceSchema.safeParse({ ...input, file: f }).success

  test.each([
    ["", "a.csv"],
    ["text/csv", "a.csv"],
    ["text/plain", "a.txt"],
    ["application/vnd.ms-excel", "a.csv"],
    ["application/csv", "a.csv"],
    ["text/x-csv", "a.csv"],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "a.xlsx",
    ],
  ])("accepts MIME %j for %s", (type, name) => {
    expect(parse(new File(["x"], name, { type }))).toBe(true)
  })

  test("rejects a disallowed MIME even with an accepted extension", () => {
    expect(parse(new File(["x"], "a.csv", { type: "image/png" }))).toBe(false)
    expect(
      uploadMoreAudienceSchema.safeParse({
        id: "r",
        file: new File(["x"], "a.csv", { type: "application/pdf" }),
      }).success,
    ).toBe(false)
  })

  test("rejects a wrong extension", () => {
    expect(parse(new File(["x"], "a.pdf", { type: "" }))).toBe(false)
  })
})
