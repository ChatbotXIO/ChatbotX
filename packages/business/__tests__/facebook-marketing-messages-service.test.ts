import { beforeEach, describe, expect, test, vi } from "vitest"

const authRepository = {
  findByWorkspaceId: vi.fn(),
  create: vi.fn(),
  updateAuth: vi.fn(),
  updateStatus: vi.fn(),
}

const campaignRepository = {
  listByWorkspaceId: vi.fn(),
  listForStatistics: vi.fn(),
  listAdAccountsByWorkspaceId: vi.fn(),
  findForWorkspace: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}

vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessagesAuthRepository: authRepository,
  facebookMarketingMessageRepository: campaignRepository,
}))

// `dispatchAuditRecord` throws outside production unless the real audit
// service has been imported to register itself. Mocked per the convention in
// the sibling business service tests.
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

vi.mock("@chatbotx.io/encryption", () => ({
  // Passthrough stand-in for the real `EncryptedData` validator: these tests
  // exercise the service's branching, not the envelope format.
  encryptedDataSchema: { parse: (value: unknown) => value },
  encryptUtils: {
    encryptObject: vi.fn(async (value: unknown) => ({ cipher: value })),
    decryptObject: vi.fn(async (value: { cipher: unknown }) => value.cipher),
  },
}))

const { facebookMarketingMessagesService } = await import(
  "../src/facebook-marketing-messages/service"
)

const auth = {
  authType: "custom",
  accessToken: "TOKEN",
  expiresAt: "2026-11-01T00:00:00.000Z",
  version: "v25.0",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("upsertAuth", () => {
  test("encrypts the token before it reaches the repository", async () => {
    authRepository.findByWorkspaceId.mockResolvedValue(null)

    await facebookMarketingMessagesService.upsertAuth({
      workspaceId: "w1",
      auth,
      tokenExpiresAt: new Date("2026-11-01T00:00:00.000Z"),
      facebookUserId: "asuid-1",
    })

    expect(authRepository.create).toHaveBeenCalledTimes(1)
    const [values] = authRepository.create.mock.calls[0]
    expect(values.auth).toEqual({ cipher: auth })
    expect(values.auth).not.toHaveProperty("accessToken")
    expect(values.facebookUserId).toBe("asuid-1")
  })

  test("re-granting updates the existing row instead of inserting a second one", async () => {
    authRepository.findByWorkspaceId.mockResolvedValue({
      id: "a1",
      workspaceId: "w1",
    })

    await facebookMarketingMessagesService.upsertAuth({
      workspaceId: "w1",
      auth,
      tokenExpiresAt: null,
      facebookUserId: "asuid-2",
    })

    expect(authRepository.create).not.toHaveBeenCalled()
    expect(authRepository.updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", facebookUserId: "asuid-2" }),
    )
  })

  test("tolerates a missing App-Scoped User ID", async () => {
    authRepository.findByWorkspaceId.mockResolvedValue(null)

    await facebookMarketingMessagesService.upsertAuth({
      workspaceId: "w1",
      auth,
      tokenExpiresAt: null,
      facebookUserId: undefined,
    })

    const [values] = authRepository.create.mock.calls[0]
    expect(values.facebookUserId).toBeNull()
  })
})

describe("decryptAuth", () => {
  test("returns the token object", async () => {
    const result = await facebookMarketingMessagesService.decryptAuth({
      auth: { cipher: auth },
    } as never)

    expect(result).toEqual(auth)
  })

  test("returns null instead of throwing when the blob cannot be decrypted", async () => {
    const { encryptUtils } = await import("@chatbotx.io/encryption")
    vi.mocked(encryptUtils.decryptObject).mockRejectedValueOnce(
      new Error("bad key"),
    )

    const result = await facebookMarketingMessagesService.decryptAuth({
      auth: { cipher: auth },
    } as never)

    expect(result).toBeNull()
  })
})

describe("markAuthInvalid", () => {
  test("flips the row to invalid", async () => {
    await facebookMarketingMessagesService.markAuthInvalid("w1")

    expect(authRepository.updateStatus).toHaveBeenCalledWith({
      workspaceId: "w1",
      status: "invalid",
    })
  })
})

describe("assertContentEditable (content lock, spec D10)", () => {
  const content = {
    templateType: "media",
    media: { url: "https://cdn.example.com/a.jpg", attachmentId: "att-1" },
  }

  test("allows any content before the first message is sent", () => {
    expect(() =>
      facebookMarketingMessagesService.assertContentEditable({
        row: { firstSentAt: null, status: "scheduled", content },
        content: { templateType: "text" },
      }),
    ).not.toThrow()
  })

  test("refuses a changed content after the first send with mmContentLocked", () => {
    expect(() =>
      facebookMarketingMessagesService.assertContentEditable({
        row: { firstSentAt: new Date(), status: "sending", content },
        content: {
          ...content,
          media: { url: "https://cdn.example.com/b.jpg" },
        },
      }),
    ).toThrow(expect.objectContaining({ code: "mmContentLocked" }))
  })

  test.each([
    "sending",
    "waitingNextDay",
    "paused",
    "stopped",
    "completed",
    "failed",
  ] as const)("F3: refuses a content change once the campaign is %s, even before firstSentAt", (status) => {
    expect(() =>
      facebookMarketingMessagesService.assertContentEditable({
        row: { firstSentAt: null, status, content },
        content: { templateType: "text" },
      }),
    ).toThrow(expect.objectContaining({ code: "mmContentLocked" }))
  })

  test("accepts identical content whether or not the attachment id is echoed back", () => {
    expect(() =>
      facebookMarketingMessagesService.assertContentEditable({
        row: { firstSentAt: new Date(), status: "sending", content },
        content: {
          templateType: "media",
          media: { url: "https://cdn.example.com/a.jpg" },
        },
      }),
    ).not.toThrow()
  })
})

describe("assertContentEditable with a form round-trip (name/budget-only edit)", () => {
  test("content re-submitted by the edit form passes the lock", async () => {
    const { mmContentSchema } = await import("@chatbotx.io/database/partials")
    const stored = mmContentSchema.parse({
      templateType: "button",
      text: "Hello",
      buttons: [
        {
          id: "1001",
          title: "Visit",
          actionType: "openWebsite",
          url: "https://example.com",
          browserSize: 100,
        },
      ],
      quickReplies: [],
    })
    // The form seeds its default values from the stored row and the action
    // schema re-parses whatever it submits.
    const submitted = mmContentSchema.parse(JSON.parse(JSON.stringify(stored)))
    expect(() =>
      facebookMarketingMessagesService.assertContentEditable({
        row: { firstSentAt: new Date(), status: "sending", content: stored },
        content: submitted,
      }),
    ).not.toThrow()
  })
})

describe("update (F3: conditional content write)", () => {
  const stored = {
    id: "c1",
    workspaceId: "w1",
    firstSentAt: null,
    status: "scheduled",
    content: { templateType: "text", text: "a" },
  }
  const edit = {
    id: "c1",
    workspaceId: "w1",
    name: "New",
    budgetType: "daily" as const,
    budgetMinorUnits: 500,
  }

  test("a content change is written only while unlocked; 0 rows means mmContentLocked", async () => {
    campaignRepository.findForWorkspace.mockResolvedValue(stored)
    campaignRepository.update.mockResolvedValue(null)
    await expect(
      facebookMarketingMessagesService.update({
        ...edit,
        content: { templateType: "text", text: "b" },
      }),
    ).rejects.toMatchObject({ code: "mmContentLocked" })
    expect(campaignRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: { templateType: "text", text: "b" },
        lockContent: true,
      }),
    )
  })

  test("a name/budget-only edit is unconditional and does not rewrite content", async () => {
    campaignRepository.findForWorkspace.mockResolvedValue({
      ...stored,
      firstSentAt: new Date(),
      status: "sending",
    })
    campaignRepository.update.mockResolvedValue({ ...stored, name: "New" })
    const row = await facebookMarketingMessagesService.update({
      ...edit,
      content: { text: "a", templateType: "text" },
    })
    expect(row).toMatchObject({ name: "New" })
    const arg = campaignRepository.update.mock.calls[0][0]
    expect(arg.content).toBeUndefined()
    expect(arg.lockContent).toBeFalsy()
  })
})

describe("statistics reads", () => {
  test("listForStatistics delegates to the repository with the input unchanged", async () => {
    const page = { data: [], total: 0, pageCount: 0 }
    campaignRepository.listForStatistics.mockResolvedValue(page)
    const input = {
      workspaceId: "w1",
      adAccountId: "act_1",
      search: "hi",
      page: 2,
      perPage: 10,
      sort: [{ id: "name" as const, desc: true }],
    }

    await expect(
      facebookMarketingMessagesService.listForStatistics(input),
    ).resolves.toBe(page)
    expect(campaignRepository.listForStatistics).toHaveBeenCalledWith(input)
  })

  test("listAdAccountsByWorkspaceId delegates to the repository", async () => {
    const accounts = [
      { adAccountId: "act_1", currency: "VND", timezoneName: null },
    ]
    campaignRepository.listAdAccountsByWorkspaceId.mockResolvedValue(accounts)

    await expect(
      facebookMarketingMessagesService.listAdAccountsByWorkspaceId("w1"),
    ).resolves.toBe(accounts)
    expect(campaignRepository.listAdAccountsByWorkspaceId).toHaveBeenCalledWith(
      "w1",
    )
  })
})
