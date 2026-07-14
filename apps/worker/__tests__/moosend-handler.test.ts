import { moosendCreateContactDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({
  auth: { authType: "custom", apiKey: "secret-api-key" },
  fields: {} as Record<string, string>,
  errorLog: vi.fn(),
  eval: vi.fn(async () => 1),
  runAction: vi.fn(async () => undefined),
  set: vi.fn(async () => "OK"),
}))

const CONTACT_LOCK_KEY_PATTERN =
  /^moosend:subscribe:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/u

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async ({ integration }: { integration: unknown }) => ({
    auth: state.auth,
    integration,
  })),
  integrationMoosendService: {
    findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: "encrypted" })),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: { decryptObject: vi.fn(async () => state.auth) },
}))

vi.mock("@chatbotx.io/integration-moosend", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/integration-moosend")
  >()),
  integration: { runAction: state.runAction },
}))

vi.mock("@chatbotx.io/redis", () => ({
  cacheConnections: {
    useExisting: vi.fn(async () => ({ eval: state.eval, set: state.set })),
  },
  distributedLock: {
    runExclusive: vi.fn(
      async ({ fn }: { fn: () => Promise<void> }) => await fn(),
    ),
  },
}))

vi.mock("../src/integration/handlers/contact-field-map", () => ({
  getContactFieldMap: vi.fn(async () => state.fields),
}))

vi.mock(
  "../src/integration/handlers/moosend-rate-limit",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../src/integration/handlers/moosend-rate-limit")
    >()),
    acquireMoosendSubscribePermit: vi.fn(async () => undefined),
  }),
)

vi.mock("../src/lib/logger", () => ({
  logger: { error: state.errorLog },
}))

const { addOrUpdateMoosendContact, buildMoosendContactLockKey } = await import(
  "../src/integration/handlers/moosend-handler"
)
const { acquireMoosendSubscribePermit } = await import(
  "../src/integration/handlers/moosend-rate-limit"
)

const createProps = () =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    step: {
      ...moosendCreateContactDefaultFn(),
      id: "step-1",
      listId: "list-1",
    },
  }) as Parameters<typeof addOrUpdateMoosendContact>[0]

beforeEach(() => {
  vi.clearAllMocks()
  state.fields = {
    email: " Person@Example.COM ",
  }
  state.set.mockResolvedValue("OK")
  state.eval.mockResolvedValue(1)
  state.runAction.mockResolvedValue(undefined)
  vi.mocked(acquireMoosendSubscribePermit).mockResolvedValue(undefined)
})

describe("addOrUpdateMoosendContact", () => {
  test("normalizes payload, acquires quota, and mutates exactly once", async () => {
    await expect(addOrUpdateMoosendContact(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })
    expect(acquireMoosendSubscribePermit).toHaveBeenCalledWith("secret-api-key")
    expect(state.runAction).toHaveBeenCalledTimes(1)
    expect(state.runAction).toHaveBeenCalledWith("createOrUpdateContact", {
      ctx: expect.any(Object),
      props: {
        listId: "list-1",
        email: "person@example.com",
      },
    })
  })

  test("returns error without mutation for invalid contact data", async () => {
    state.fields.email = "invalid"
    await expect(
      addOrUpdateMoosendContact(createProps()),
    ).resolves.toMatchObject({ status: "error" })
    expect(acquireMoosendSubscribePermit).not.toHaveBeenCalled()
    expect(state.runAction).not.toHaveBeenCalled()
  })

  test("uses hashed lock keys with no workspace, list, email, or API key", () => {
    const key = buildMoosendContactLockKey({
      workspaceId: "workspace-1",
      listId: "list-1",
      email: "person@example.com",
    })
    expect(key).toMatch(CONTACT_LOCK_KEY_PATTERN)
    expect(key).not.toContain("workspace-1")
    expect(key).not.toContain("list-1")
    expect(key).not.toContain("person@example.com")
    expect(key).not.toContain("secret-api-key")
  })

  test("does not retry provider failures and keeps logs secret/PII-safe", async () => {
    state.runAction.mockRejectedValueOnce(new Error("provider failed"))
    await expect(
      addOrUpdateMoosendContact(createProps()),
    ).resolves.toMatchObject({ status: "error" })
    expect(state.runAction).toHaveBeenCalledTimes(1)
    const logs = JSON.stringify(state.errorLog.mock.calls)
    expect(logs).not.toContain("secret-api-key")
    expect(logs).not.toContain("person@example.com")
  })
})
