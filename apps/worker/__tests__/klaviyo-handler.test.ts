import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { klaviyoSyncProfileDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { buildKlaviyoProfileProps } from "../src/integration/handlers/klaviyo-handler"

const PRIVATE_LOCK_KEY_PATTERN =
  /^klaviyo:sync-profile:[a-f0-9]{64}:[a-f0-9]{64}$/

type LockProps = {
  key: string
  timeoutInSeconds: number
  fn: () => Promise<void>
}

const mocks = vi.hoisted(() => ({
  runAction: vi.fn(async () => ({
    profileId: "profile-1",
    email: "person@example.com",
  })),
  runExclusive: vi.fn(async (props: LockProps) => await props.fn()),
  state: {
    auth: { authType: "custom", apiKey: "secret-api-key" },
    fields: {} as Record<string, string>,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async ({ integration }: { integration: unknown }) => ({
    auth: mocks.state.auth,
    integration,
  })),
  integrationKlaviyoService: {
    findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: "encrypted" })),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: { decryptObject: vi.fn(async () => mocks.state.auth) },
}))

vi.mock("@chatbotx.io/integration-klaviyo", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/integration-klaviyo")
  >()),
  integration: { runAction: mocks.runAction },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

vi.mock("../src/integration/handlers/contact-field-map", () => ({
  getContactFieldMap: vi.fn(async () => mocks.state.fields),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

const { syncKlaviyoProfile } = await import(
  "../src/integration/handlers/klaviyo-handler"
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
      ...klaviyoSyncProfileDefaultFn(),
      id: "step-1",
    },
  }) as Parameters<typeof syncKlaviyoProfile>[0]

beforeEach(() => {
  mocks.state.fields = {
    [systemFieldTypes.enum.email]: "person@example.com",
  }
  vi.clearAllMocks()
  mocks.runAction.mockResolvedValue({
    profileId: "profile-1",
    email: "person@example.com",
  })
  mocks.runExclusive.mockImplementation(
    async (props: LockProps) => await props.fn(),
  )
})

describe("Klaviyo profile payload", () => {
  test("normalizes reserved fields, E164, explicit fields, and properties", () => {
    expect(
      buildKlaviyoProfileProps(
        {
          email: " Person@Example.com ",
          [systemFieldTypes.enum.full_name]: "Ada Lovelace",
          [systemFieldTypes.enum.phone]: "+84901234567",
          title: " Countess ",
          org: " Analytical Engines ",
          plan: " Pro ",
          empty: " ",
        },
        {
          ...klaviyoSyncProfileDefaultFn(),
          titleField: "title",
          orgField: "org",
          listId: "list-1",
          mergeFields: [
            { contactFieldId: "plan", klaviyoProperty: "Plan" },
            { contactFieldId: "empty", klaviyoProperty: "Empty" },
          ],
        },
      ),
    ).toEqual({
      email: "person@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
      phone_number: "+84901234567",
      title: "Countess",
      organization: "Analytical Engines",
      properties: { Plan: "Pro" },
      listId: "list-1",
    })
  })

  test("supports international prefixes and omits ambiguous local phones", () => {
    const defaults = klaviyoSyncProfileDefaultFn()
    const fields = { email: "a@example.com" }
    expect(
      buildKlaviyoProfileProps(
        { ...fields, [systemFieldTypes.enum.phone]: "+84901234567" },
        defaults,
      ),
    ).toHaveProperty("phone_number", "+84901234567")
    expect(
      buildKlaviyoProfileProps(
        { ...fields, [systemFieldTypes.enum.phone]: "0084901234567" },
        defaults,
      ),
    ).toHaveProperty("phone_number", "+84901234567")
    expect(
      buildKlaviyoProfileProps(
        { ...fields, [systemFieldTypes.enum.phone]: "0901234567" },
        defaults,
      ),
    ).not.toHaveProperty("phone_number")
    expect(
      buildKlaviyoProfileProps(
        { ...fields, [systemFieldTypes.enum.phone]: "invalid" },
        defaults,
      ),
    ).not.toHaveProperty("phone_number")
  })

  test("rejects empty email and omits optional routing props", () => {
    expect(() =>
      buildKlaviyoProfileProps({}, klaviyoSyncProfileDefaultFn()),
    ).toThrow("Klaviyo profile email is empty")
    expect(
      buildKlaviyoProfileProps(
        { email: "a@example.com" },
        klaviyoSyncProfileDefaultFn(),
      ),
    ).toEqual({ email: "a@example.com" })
    expect(() =>
      buildKlaviyoProfileProps(
        { email: "not-an-email" },
        klaviyoSyncProfileDefaultFn(),
      ),
    ).toThrow()
  })
})

describe("syncKlaviyoProfile", () => {
  test("uses a PII-safe lock and executes provider sync", async () => {
    await expect(syncKlaviyoProfile(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })
    const lockKey = mocks.runExclusive.mock.calls[0]?.[0].key as string
    expect(lockKey).toMatch(PRIVATE_LOCK_KEY_PATTERN)
    expect(lockKey).not.toContain("workspace-1")
    expect(lockKey).not.toContain("person@example.com")
    expect(lockKey).not.toContain("secret-api-key")
    expect(mocks.runAction).toHaveBeenCalledWith(
      "syncProfile",
      expect.objectContaining({
        props: { email: "person@example.com" },
      }),
    )
  })

  test("returns an error before locking when email is empty", async () => {
    mocks.state.fields = {}
    await expect(syncKlaviyoProfile(createProps())).resolves.toMatchObject({
      status: "error",
      errorMessage: "Klaviyo profile email is empty",
    })
    expect(mocks.runExclusive).not.toHaveBeenCalled()
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  test("returns an error state when provider sync fails", async () => {
    mocks.runAction.mockRejectedValue(new Error("provider failed"))
    await expect(syncKlaviyoProfile(createProps())).resolves.toMatchObject({
      status: "error",
      errorMessage: "provider failed",
    })
  })
})
