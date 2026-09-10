import { beforeEach, describe, expect, test, vi } from "vitest"

const PRIVATE_LOCK_KEY_PATTERN =
  /^active-campaign:sync-contact:[a-f0-9]{64}:[a-f0-9]{64}$/

const state = {
  auth: {
    authType: "custom",
    apiUrl: "https://example.api-us1.com",
    apiKey: "secret-key",
  },
  fields: {} as Record<string, string>,
}

type LockProps = {
  key: string
  timeoutInSeconds: number
  fn: () => Promise<void>
}

const runAction = vi.fn(async (action: string) =>
  action === "syncContact" ? { id: "contact-123" } : undefined,
)
const runExclusive = vi.fn(async (props: LockProps) => await props.fn())
const errorLog = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async ({ integration }: { integration: unknown }) => ({
    auth: state.auth,
    integration,
  })),
  integrationActiveCampaignService: {
    findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: "encrypted" })),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: {
    decryptObject: vi.fn(async () => state.auth),
  },
}))

vi.mock("@chatbotx.io/integration-active-campaign", () => ({
  ACTIVE_CAMPAIGN_HTTP_TIMEOUT_MS: 15_000,
  activeCampaignAuthSchema: {},
  integration: { runAction },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
}))

vi.mock("../src/integration/handlers/contact-field-map", () => ({
  getContactFieldMap: vi.fn(async () => state.fields),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: errorLog },
}))

const { syncActiveCampaignContact } = await import(
  "../src/integration/handlers/active-campaign-handler"
)

const createProps = () =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    contactInbox: {
      id: "contact-inbox-1",
      contactId: "contact-1",
      sourceId: "psid-1",
    },
    step: {
      id: "step-1",
      emailField: "email",
      phoneField: "phone",
      listIds: ["list-1"],
      tagIds: ["tag-1"],
      fieldValues: [
        { contactFieldId: "company", activeCampaignFieldId: "field-1" },
      ],
    },
  }) as Parameters<typeof syncActiveCampaignContact>[0]

beforeEach(() => {
  state.fields = {
    email: " Person@Example.COM ",
    phone: " 123 ",
    company: " Analytical Engines ",
  }
  vi.clearAllMocks()
  runAction.mockImplementation(async (action: string) =>
    action === "syncContact" ? { id: "contact-123" } : undefined,
  )
  runExclusive.mockImplementation(async (props: LockProps) => await props.fn())
})

describe("syncActiveCampaignContact", () => {
  test("syncs contact resources and serializes without exposing API URL or email", async () => {
    await expect(syncActiveCampaignContact(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })

    expect(runAction).toHaveBeenNthCalledWith(1, "syncContact", {
      ctx: expect.any(Object),
      props: {
        email: "person@example.com",
        phone: "123",
        fieldValues: [{ fieldId: "field-1", value: "Analytical Engines" }],
      },
    })
    expect(runAction).toHaveBeenNthCalledWith(2, "addContactToList", {
      ctx: expect.any(Object),
      props: { contactId: "contact-123", listId: "list-1", status: "1" },
    })
    expect(runAction).toHaveBeenNthCalledWith(3, "addTagToContact", {
      ctx: expect.any(Object),
      props: { contactId: "contact-123", tagId: "tag-1" },
    })

    const lockKey = runExclusive.mock.calls[0]?.[0].key
    expect(lockKey).toMatch(PRIVATE_LOCK_KEY_PATTERN)
    expect(lockKey).not.toContain("example.api-us1.com")
    expect(lockKey).not.toContain("person@example.com")
  })

  test("omits empty optional provider resources", async () => {
    const props = createProps()
    props.step.listIds = []
    props.step.tagIds = []
    state.fields.company = " "

    await syncActiveCampaignContact(props)

    expect(runAction).toHaveBeenCalledTimes(1)
    expect(runAction).toHaveBeenCalledWith("syncContact", {
      ctx: expect.any(Object),
      props: expect.objectContaining({ email: "person@example.com" }),
    })
  })

  test("returns the error state without calling ActiveCampaign when email is empty", async () => {
    state.fields.email = " "

    await expect(syncActiveCampaignContact(createProps())).resolves.toEqual({
      status: "error",
      errorMessage: "ActiveCampaign contact email is empty",
      result: null,
    })
    expect(runExclusive).not.toHaveBeenCalled()
    expect(runAction).not.toHaveBeenCalled()
  })

  test("routes provider failure to error with no PII logs and no retry", async () => {
    runAction.mockRejectedValueOnce(new Error("provider failed"))

    await expect(
      syncActiveCampaignContact(createProps()),
    ).resolves.toMatchObject({
      status: "error",
      errorMessage: "provider failed",
    })

    expect(runAction).toHaveBeenCalledTimes(1)
    const logs = JSON.stringify(errorLog.mock.calls)
    expect(logs).not.toContain("person@example.com")
    expect(logs).not.toContain("Analytical Engines")
    expect(logs).not.toContain("secret-key")
  })
})
