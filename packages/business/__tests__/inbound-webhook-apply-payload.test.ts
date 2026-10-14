import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loadExtractionContext: vi.fn(),
  resolveInbox: vi.fn(),
  resolveContact: vi.fn(),
  applyMappedContactFields: vi.fn(),
}))

vi.mock("../src/inbound-webhook/extraction-context", () => ({
  loadExtractionContext: mocks.loadExtractionContext,
}))
vi.mock("../src/inbound-webhook/resolve-inbox", () => ({
  resolveInboundWebhookInbox: mocks.resolveInbox,
}))
vi.mock("../src/inbound-webhook/resolve-contact", () => ({
  resolveInboundWebhookContact: mocks.resolveContact,
}))
vi.mock(
  "../src/inbound-webhook/apply-mapped-fields",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../src/inbound-webhook/apply-mapped-fields")
      >()
    return {
      ...actual,
      applyMappedContactFields: mocks.applyMappedContactFields,
    }
  },
)

const { applyInboundWebhookPayload, buildNewContactName } = await import(
  "../src/inbound-webhook/apply-payload"
)

const inbox = { id: "inbox-1", channel: "messenger" }
const webhook = {
  id: "w-1",
  workspaceId: "ws-1",
  inboxResolution: {
    mode: "payload" as const,
    channel: "messenger" as const,
    identifierKind: "pageId" as const,
    jsonPath: "$.entry[0].id",
  },
  identifiers: [{ kind: "channelUserId" as const, jsonPath: "$.sender.id" }],
  fieldMappings: [
    { jsonPath: "$.name", target: "full_name" },
    { jsonPath: "$.total", target: "100" },
    { jsonPath: "$.bad", target: "100" },
  ],
}
const payload = {
  entry: [{ id: "page-1" }],
  sender: { id: "psid-1" },
  name: "John Silva",
  total: "9.5",
  bad: "abc",
}

const apply = (overrides: Partial<typeof webhook> = {}) =>
  applyInboundWebhookPayload({
    webhook: { ...webhook, ...overrides } as never,
    payload,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadExtractionContext.mockResolvedValue({
    targetCountry: "VN",
    customFieldTypeById: new Map([["100", "number"]]),
  })
  mocks.resolveInbox.mockResolvedValue({ inbox })
  mocks.resolveContact.mockResolvedValue({
    contactId: "c-1",
    contactInboxId: "ci-1",
    isNew: true,
  })
})

describe("applyInboundWebhookPayload", () => {
  test("resolves inbox then contact, writes the valid fields and reports the rejected ones", async () => {
    const result = await apply()

    expect(result).toEqual({
      status: "processed",
      inboxId: "inbox-1",
      contactId: "c-1",
      contactInboxId: "ci-1",
      isNew: true,
      fieldErrors: [{ target: "100", code: "invalidValue" }],
    })
    expect(mocks.resolveInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      resolution: webhook.inboxResolution,
      inboxIdentifier: "page-1",
    })
    expect(mocks.applyMappedContactFields).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      contactInboxId: "ci-1",
      fields: [
        expect.objectContaining({ target: "full_name", value: "John Silva" }),
        expect.objectContaining({ target: "100", value: "9.5" }),
      ],
    })
  })

  test("creates the contact with the mapped name so the contact-created event carries it", async () => {
    await apply()

    expect(mocks.resolveContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inbox,
      identities: { channelUserId: "psid-1" },
      profile: { firstName: "John", lastName: "Silva" },
    })
  })

  test("skips without touching contacts when the inbox cannot be resolved", async () => {
    mocks.resolveInbox.mockResolvedValue({ skipReason: "inboxNotFound" })

    const result = await apply()

    expect(result).toMatchObject({ status: "skipped", reason: "inboxNotFound" })
    expect(mocks.resolveContact).not.toHaveBeenCalled()
    expect(mocks.applyMappedContactFields).not.toHaveBeenCalled()
  })

  test("skips and writes nothing when the payload has no usable identity", async () => {
    mocks.resolveContact.mockResolvedValue({ skipReason: "missingIdentifier" })

    const result = await apply()

    expect(result).toMatchObject({
      status: "skipped",
      reason: "missingIdentifier",
      inboxId: "inbox-1",
    })
    expect(mocks.applyMappedContactFields).not.toHaveBeenCalled()
  })

  test("an incomplete config is skipped as inactive without any lookup", async () => {
    const result = await apply({ inboxResolution: null } as never)

    expect(result).toEqual({
      status: "skipped",
      reason: "webhookInactive",
      fieldErrors: [],
    })
    expect(mocks.loadExtractionContext).not.toHaveBeenCalled()
  })

  test("lets infrastructure failures propagate so the job is retried", async () => {
    mocks.resolveContact.mockRejectedValue(new Error("db down"))

    await expect(apply()).rejects.toThrow("db down")
    expect(mocks.applyMappedContactFields).not.toHaveBeenCalled()
  })

  test("is repeatable: a second run for the same payload finds the contact instead of creating one", async () => {
    mocks.resolveContact.mockResolvedValue({
      contactId: "c-1",
      contactInboxId: "ci-1",
      isNew: false,
    })

    await expect(apply()).resolves.toMatchObject({ isNew: false })
  })
})

describe("buildNewContactName", () => {
  test("starts from the contact section's full name", () => {
    expect(buildNewContactName("An Nguyen Van", {})).toEqual({
      firstName: "An",
      lastName: "Nguyen Van",
    })
  })

  test("a mapped first_name overrides the first name and keeps the base last name", () => {
    expect(buildNewContactName("An Nguyen", { first_name: "Binh" })).toEqual({
      firstName: "Binh",
      lastName: "Nguyen",
    })
  })

  test("a mapped full_name replaces both parts of the base", () => {
    expect(buildNewContactName("An Nguyen", { full_name: "Cuong" })).toEqual({
      firstName: "Cuong",
      lastName: undefined,
    })
  })

  test("full_name and first_name together apply in row order, later wins", () => {
    expect(
      buildNewContactName(undefined, {
        full_name: "An Nguyen",
        first_name: "Binh",
      }),
    ).toEqual({ firstName: "Binh", lastName: "Nguyen" })
    expect(
      buildNewContactName(undefined, {
        first_name: "Binh",
        full_name: "An Nguyen",
      }),
    ).toEqual({ firstName: "An", lastName: "Nguyen" })
  })

  test("has no name at all without either source", () => {
    expect(buildNewContactName(undefined, {})).toEqual({
      firstName: undefined,
      lastName: undefined,
    })
  })
})
