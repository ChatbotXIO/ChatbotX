import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { mailerLiteAddSubscriberDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { buildMailerLiteSubscriberProps } from "../src/integration/handlers/mailer-lite-handler"

// ─── Lock-key integration tests ───────────────────────────────────────────────

const PRIVATE_LOCK_KEY_PATTERN =
  /^mailer-lite:sync-subscriber:[a-f0-9]{64}:[a-f0-9]{64}$/

type LockProps = {
  key: string
  timeoutInSeconds: number
  fn: () => Promise<void>
}

const mocks = vi.hoisted(() => ({
  runAction: vi.fn(async () => undefined),
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
  integrationMailerLiteService: {
    findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: "encrypted" })),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: {
    decryptObject: vi.fn(async () => mocks.state.auth),
  },
}))

vi.mock("@chatbotx.io/integration-mailer-lite", () => ({
  MAILER_LITE_HTTP_TIMEOUT_MS: 15_000,
  MailerLiteApiError: class MailerLiteApiError extends Error {},
  mailerLiteAuthSchema: {},
  integration: { runAction: mocks.runAction },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

vi.mock("../src/integration/handlers/contact-field-map", () => ({
  getContactFieldMap: vi.fn(async () => mocks.state.fields),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

const { addMailerLiteSubscriber } = await import(
  "../src/integration/handlers/mailer-lite-handler"
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
      ...mailerLiteAddSubscriberDefaultFn(),
      id: "step-1",
    },
  }) as Parameters<typeof addMailerLiteSubscriber>[0]

beforeEach(() => {
  mocks.state.fields = {
    [systemFieldTypes.enum.email]: "person@example.com",
    [systemFieldTypes.enum.first_name]: "Ada",
    [systemFieldTypes.enum.last_name]: "Lovelace",
  }
  vi.clearAllMocks()
  mocks.runAction.mockResolvedValue(undefined)
  mocks.runExclusive.mockImplementation(
    async (props: LockProps) => await props.fn(),
  )
})

describe("addMailerLiteSubscriber lock key", () => {
  test("uses hashed workspaceId (not apiKey) and hashed email — no PII in key", async () => {
    await expect(addMailerLiteSubscriber(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })

    const lockKey = mocks.runExclusive.mock.calls[0]?.[0].key as string
    expect(lockKey).toMatch(PRIVATE_LOCK_KEY_PATTERN)
    expect(lockKey).not.toContain("workspace-1")
    expect(lockKey).not.toContain("person@example.com")
    expect(lockKey).not.toContain("secret-api-key")
  })

  test("returns error state without calling provider when email is empty", async () => {
    mocks.state.fields[systemFieldTypes.enum.email] = " "

    await expect(addMailerLiteSubscriber(createProps())).resolves.toEqual({
      status: "error",
      errorMessage: "MailerLite subscriber email is empty",
      result: null,
    })
    expect(mocks.runExclusive).not.toHaveBeenCalled()
    expect(mocks.runAction).not.toHaveBeenCalled()
  })
})

// ─── Pure payload builder tests ───────────────────────────────────────────────

describe("MailerLite subscriber payload", () => {
  test("normalizes email, applies explicit mapping precedence, and omits empty values", () => {
    const step = {
      ...mailerLiteAddSubscriberDefaultFn(),
      groupId: "group-1",
      status: "active" as const,
      mergeFields: [
        { contactFieldId: "plan-field", mailerLiteField: "plan" },
        { contactFieldId: "empty-field", mailerLiteField: "empty" },
        { contactFieldId: "unsafe-field", mailerLiteField: "phone" },
      ],
    }
    expect(
      buildMailerLiteSubscriberProps(
        {
          [systemFieldTypes.enum.email]: " Person@Example.com ",
          [systemFieldTypes.enum.first_name]: "Ada",
          [systemFieldTypes.enum.last_name]: "Lovelace",
          [systemFieldTypes.enum.phone]: "123",
          "plan-field": " Pro ",
          "empty-field": " ",
          "unsafe-field": "unsafe",
        },
        step,
      ),
    ).toEqual({
      email: "person@example.com",
      status: "active",
      groups: ["group-1"],
      fields: {
        name: "Ada",
        last_name: "Lovelace",
        phone: "unsafe",
        plan: "Pro",
      },
    })
  })

  test("omits group and fields and rejects an empty email", () => {
    const step = mailerLiteAddSubscriberDefaultFn()
    expect(() => buildMailerLiteSubscriberProps({}, step)).toThrow(
      "MailerLite subscriber email is empty",
    )
    expect(
      buildMailerLiteSubscriberProps(
        { [systemFieldTypes.enum.email]: "a@example.com" },
        step,
      ),
    ).toEqual({
      email: "a@example.com",
      status: "unconfirmed",
    })
  })
})
