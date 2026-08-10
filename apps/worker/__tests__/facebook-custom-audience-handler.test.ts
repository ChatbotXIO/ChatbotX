import { beforeEach, describe, expect, test, vi } from "vitest"

const state = {
  auth: {
    authType: "custom",
    accessToken: "secret-token",
    version: "v23.0",
  },
  contact: {
    email: "person@example.com",
    phoneNumber: "0912345678",
    firstName: "An",
    lastName: "Nguyen",
    country: "VN",
  } as Record<string, string | null>,
}

const runAction = vi.fn(async () => undefined)
const markInvalid = vi.fn(async () => undefined)
const findByInboxId = vi.fn(async () => ({
  pageId: "page-99",
}))
const errorLog = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async ({ integration }: { integration: unknown }) => ({
    auth: state.auth,
    integration,
  })),
  contactService: {
    findByIdOrFail: vi.fn(async () => state.contact),
  },
  messengerIntegrationService: { findByInboxId },
  integrationFacebookAdsService: {
    findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: "encrypted" })),
    markInvalid,
  },
  workspaceService: {
    findById: vi.fn(async () => ({ targetCountry: "VN" })),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: {
    decryptObject: vi.fn(async () => state.auth),
  },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  GRAPH_ERROR_CODE_INVALID_TOKEN: 190,
  facebookAdsAuthSchema: {},
  getGraphErrorCode: (error: unknown) =>
    typeof (error as { code?: unknown })?.code === "number"
      ? (error as { code: number }).code
      : undefined,
  integration: { runAction },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: errorLog },
}))

const { handleFacebookCustomAudience } = await import(
  "../src/integration/handlers/facebook-custom-audience-handler"
)

const createProps = (channel = "messenger") =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    contactInbox: {
      channel,
      sourceId: "psid-1",
      inboxId: "inbox-1",
    },
    step: {
      id: "step-1",
      stepType: "facebookCustomAudience",
      operation: "add",
      adAccountId: "act_1",
      customAudienceId: "aud-1",
    },
  }) as unknown as Parameters<typeof handleFacebookCustomAudience>[0]

beforeEach(() => {
  vi.clearAllMocks()
  runAction.mockResolvedValue(undefined)
  findByInboxId.mockResolvedValue({ pageId: "page-99" })
})

describe("handleFacebookCustomAudience", () => {
  test("passes messenger identity and contact PII to the integration action", async () => {
    await expect(
      handleFacebookCustomAudience(createProps()),
    ).resolves.toBeUndefined()

    expect(runAction).toHaveBeenCalledWith("syncAudienceUser", {
      ctx: expect.any(Object),
      props: {
        customAudienceId: "aud-1",
        operation: "add",
        psid: "psid-1",
        pageId: "page-99",
        fallbackCountry: "VN",
        contact: {
          email: "person@example.com",
          phoneNumber: "0912345678",
          firstName: "An",
          lastName: "Nguyen",
          country: "VN",
        },
      },
    })
  })

  test("omits messenger identity for non-messenger conversations", async () => {
    await handleFacebookCustomAudience(createProps("whatsapp"))

    expect(findByInboxId).not.toHaveBeenCalled()
    expect(runAction).toHaveBeenCalledWith(
      "syncAudienceUser",
      expect.objectContaining({
        props: expect.objectContaining({ psid: null, pageId: null }),
      }),
    )
  })

  test("logs and continues without throwing when the action fails", async () => {
    runAction.mockRejectedValueOnce(new Error("provider failed"))

    await expect(
      handleFacebookCustomAudience(createProps()),
    ).resolves.toBeUndefined()
    expect(markInvalid).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()

    const logs = JSON.stringify(errorLog.mock.calls)
    expect(logs).not.toContain("secret-token")
  })

  test("marks the integration invalid on Graph error 190", async () => {
    const expiredError = Object.assign(new Error("token expired"), {
      code: 190,
    })
    runAction.mockRejectedValueOnce(expiredError)

    await expect(
      handleFacebookCustomAudience(createProps()),
    ).resolves.toBeUndefined()
    expect(markInvalid).toHaveBeenCalledWith("workspace-1")
  })
})
