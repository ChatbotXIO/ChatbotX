import { beforeEach, describe, expect, test, vi } from "vitest"

const PRIVATE_LOCK_KEY_PATTERN =
  /^get-response:sync-contact:[a-f0-9]{64}:[a-f0-9]{64}$/

const state = {
  auth: {
    authType: "custom",
    apiKey: "secret-key",
  },
  fields: {} as Record<string, string>,
}

type LockProps = {
  key: string
  timeoutInSeconds: number
  fn: () => Promise<void>
}

const runAction = vi.fn(async () => undefined)
const runExclusive = vi.fn(async (props: LockProps) => await props.fn())
const errorLog = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async ({ integration }: { integration: unknown }) => ({
    auth: state.auth,
    integration,
  })),
  integrationGetResponseService: {
    findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: "encrypted" })),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: {
    decryptObject: vi.fn(async () => state.auth),
  },
}))

vi.mock("@chatbotx.io/integration-get-response", () => {
  class GetResponseApiError extends Error {
    statusCode: number
    retryAfterSeconds?: number

    constructor(props: {
      message: string
      statusCode: number
      retryAfterSeconds?: number
    }) {
      super(props.message)
      this.statusCode = props.statusCode
      this.retryAfterSeconds = props.retryAfterSeconds
    }
  }

  return {
    GET_RESPONSE_HTTP_TIMEOUT_MS: 15_000,
    GetResponseApiError,
    getResponseAuthSchema: {},
    integration: { runAction },
  }
})

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
}))

vi.mock("../src/integration/handlers/contact-field-map", () => ({
  getContactFieldMap: vi.fn(async () => state.fields),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: errorLog },
}))

const { addGetResponseContact, buildGetResponseContactProps } = await import(
  "../src/integration/handlers/get-response-handler"
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
      campaignId: "campaign-1",
      tags: ["tag-1"],
      dayOfCycle: "0",
    },
  }) as Parameters<typeof addGetResponseContact>[0]

beforeEach(() => {
  state.fields = {
    email: " Person@Example.COM ",
    first_name: "Ada",
    last_name: "Lovelace",
  }
  vi.clearAllMocks()
  runAction.mockResolvedValue(undefined)
  runExclusive.mockImplementation(async (props: LockProps) => await props.fn())
})

describe("buildGetResponseContactProps", () => {
  test("builds a GetResponse payload and omits custom field mappings", () => {
    const result = buildGetResponseContactProps(
      state.fields,
      createProps().step,
    )

    expect(result).toEqual({
      email: "person@example.com",
      name: "Ada Lovelace",
      campaign: { campaignId: "campaign-1" },
      tags: [{ tagId: "tag-1" }],
      dayOfCycle: 0,
    })
    expect(result).not.toHaveProperty("customFieldValues")
  })

  test("omits name shorter than GetResponse minimum and empty tags", () => {
    state.fields.first_name = "Al"
    state.fields.last_name = ""
    const step = createProps().step
    step.tags = []

    expect(buildGetResponseContactProps(state.fields, step)).toEqual({
      email: "person@example.com",
      campaign: { campaignId: "campaign-1" },
      dayOfCycle: 0,
    })
  })

  test("requires email and campaign", () => {
    state.fields.email = " "
    expect(() =>
      buildGetResponseContactProps(state.fields, createProps().step),
    ).toThrow("GetResponse contact email is empty")

    state.fields.email = "person@example.com"
    const step = createProps().step
    step.campaignId = " "
    expect(() => buildGetResponseContactProps(state.fields, step)).toThrow(
      "GetResponse list is not configured",
    )
  })
})

describe("addGetResponseContact", () => {
  test("syncs one contact under a private workspace/email lock", async () => {
    await expect(addGetResponseContact(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })

    expect(runAction).toHaveBeenCalledTimes(1)
    expect(runAction).toHaveBeenCalledWith("createOrUpdateContact", {
      ctx: expect.any(Object),
      props: {
        email: "person@example.com",
        name: "Ada Lovelace",
        campaign: { campaignId: "campaign-1" },
        tags: [{ tagId: "tag-1" }],
        dayOfCycle: 0,
      },
    })

    const lockKey = runExclusive.mock.calls[0]?.[0].key
    expect(lockKey).toMatch(PRIVATE_LOCK_KEY_PATTERN)
    expect(lockKey).not.toContain("workspace-1")
    expect(lockKey).not.toContain("person@example.com")
  })

  test("routes provider failure to error without retrying or logging PII", async () => {
    runAction.mockRejectedValueOnce(new Error("provider failed"))

    await expect(addGetResponseContact(createProps())).resolves.toMatchObject({
      status: "error",
      errorMessage: "provider failed",
    })

    expect(runAction).toHaveBeenCalledTimes(1)
    const logs = JSON.stringify(errorLog.mock.calls)
    expect(logs).not.toContain("person@example.com")
    expect(logs).not.toContain("secret-key")
    expect(logs).not.toContain("Ada")
  })
})
