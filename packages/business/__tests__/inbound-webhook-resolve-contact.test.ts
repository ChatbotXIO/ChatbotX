import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findLatestBySource: vi.fn(),
  findByIdentity: vi.fn(),
  findByFullName: vi.fn(),
  createContactWithInbox: vi.fn(),
  runExclusive: vi.fn(),
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findLatestBySource: mocks.findLatestBySource },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findLatestByInboxAndContactIdentity: mocks.findByIdentity,
    findByInboxAndFullName: mocks.findByFullName,
  },
}))
vi.mock("../src/contact/create-with-inbox", () => ({
  CONTACT_ALREADY_ON_INBOX_MESSAGE:
    "This contact already exists on the selected inbox",
  createContactWithInbox: mocks.createContactWithInbox,
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

const { DrizzleQueryError } = await import("@chatbotx.io/database/client")
const { ChatbotXException, validationException } = await import("../src/errors")
const { resolveInboundWebhookContact } = await import(
  "../src/inbound-webhook/resolve-contact"
)

const inboxOf = (channel: string, id = "inbox-1") => ({
  id,
  channel,
  workspaceId: "ws-1",
  status: "connected",
})
const profile = { firstName: "John" }

const resolve = (
  channel: string,
  identities: Parameters<typeof resolveInboundWebhookContact>[0]["identities"],
) =>
  resolveInboundWebhookContact({
    workspaceId: "ws-1",
    inbox: inboxOf(channel) as never,
    identities,
    profile,
  })

const created = {
  contact: { id: "c-new" },
  contactInbox: { id: "ci-new" },
}

// Drizzle wraps the driver error: the SQLSTATE lives on `cause`.
const uniqueViolation = (constraint: string) =>
  new DrizzleQueryError(
    "insert into ContactInbox",
    [],
    Object.assign(new Error("duplicate key"), { code: "23505", constraint }),
  )

const alreadyOnInbox = () =>
  validationException(
    "contactId",
    "This contact already exists on the selected inbox",
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findLatestBySource.mockResolvedValue(undefined)
  mocks.findByIdentity.mockResolvedValue(null)
  mocks.findByFullName.mockResolvedValue([])
  mocks.createContactWithInbox.mockResolvedValue(created)
  mocks.runExclusive.mockImplementation(
    ({ fn }: { fn: () => Promise<unknown> }) => fn(),
  )
})

describe("finding the contact on the resolved inbox", () => {
  test("a PSID already on the inbox is the contact, with no lock and no creation", async () => {
    mocks.findLatestBySource.mockResolvedValue({ id: "ci-1", contactId: "c-1" })

    const result = await resolve("messenger", { channelUserId: "psid-1" })

    expect(result).toEqual({
      contactId: "c-1",
      contactInboxId: "ci-1",
      isNew: false,
    })
    expect(mocks.findLatestBySource).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      sourceId: "psid-1",
      workspaceId: "ws-1",
    })
    expect(mocks.runExclusive).not.toHaveBeenCalled()
    expect(mocks.createContactWithInbox).not.toHaveBeenCalled()
  })

  test("WhatsApp finds the contact by the phone digits on that inbox", async () => {
    mocks.findLatestBySource.mockResolvedValue({ id: "ci-2", contactId: "c-2" })

    const result = await resolve("whatsapp", { phoneE164: "+84901234567" })

    expect(result).toEqual({
      contactId: "c-2",
      contactInboxId: "ci-2",
      isNew: false,
    })
    expect(mocks.findLatestBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "84901234567" }),
    )
  })

  test.each([
    ["whatsapp", { phoneE164: "+84901234567" }],
    ["smtp", { email: "b@example.com" }],
  ] as const)("%s never falls back to the profile fields: another contact whose profile was edited to this value is not picked", async (channel, identities) => {
    // Contact A's profile now shows B's phone/email, but A's connection is
    // still keyed by A's own number/address.
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-a",
      contactInboxId: "ci-a",
    })

    const result = await resolve(channel, identities)

    expect(mocks.findByIdentity).not.toHaveBeenCalled()
    expect(result).toEqual({
      contactId: "c-new",
      contactInboxId: "ci-new",
      isNew: true,
    })
  })

  test("webchat has no derivable source id, so it matches by phone/email on the inbox only", async () => {
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-3",
      contactInboxId: "ci-3",
    })

    await resolve("webchat", { phoneE164: "+84901234567", email: "a@b.co" })

    expect(mocks.findLatestBySource).not.toHaveBeenCalled()
    // Only the first identity in lookup order (the phone) is queried.
    expect(mocks.findByIdentity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      field: "phoneNumber",
      value: "+84901234567",
    })
  })

  test("only the first identity in lookup order is queried, with no fall-through", async () => {
    await resolve("messenger", {
      channelUserId: "psid-1",
      phoneE164: "+84901234567",
      email: "a@b.co",
      fullName: "An Nguyen",
    })

    expect(mocks.findLatestBySource).toHaveBeenCalledTimes(3) // lookup, in-lock re-check, creation owner
    expect(mocks.findByIdentity).not.toHaveBeenCalled()
    expect(mocks.findByFullName).not.toHaveBeenCalled()
  })

  test("without a channel user id the phone is the lookup, on the inbox's profile fields for Messenger", async () => {
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-9",
      contactInboxId: "ci-9",
    })

    const result = await resolve("messenger", {
      phoneE164: "+84901234567",
      email: "a@b.co",
    })

    expect(result).toEqual({
      contactId: "c-9",
      contactInboxId: "ci-9",
      isNew: false,
    })
    expect(mocks.findByIdentity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      field: "phoneNumber",
      value: "+84901234567",
    })
  })

  test("email is the lookup after phone is absent", async () => {
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-9",
      contactInboxId: "ci-9",
    })

    await resolve("messenger", { email: "a@b.co", fullName: "An" })

    expect(mocks.findByIdentity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      field: "email",
      value: "a@b.co",
    })
    expect(mocks.findByFullName).not.toHaveBeenCalled()
  })

  test("a full name alone finds the contact by name on this inbox", async () => {
    mocks.findByFullName.mockResolvedValue([
      { contactId: "c-n", contactInboxId: "ci-n" },
    ])

    const result = await resolve("webchat", { fullName: "An Nguyen" })

    expect(result).toEqual({
      contactId: "c-n",
      contactInboxId: "ci-n",
      isNew: false,
    })
    expect(mocks.findByFullName).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      fullName: "An Nguyen",
    })
  })

  test("two different contacts with the same name are ambiguous: nothing is written or sent to either", async () => {
    mocks.findByFullName.mockResolvedValue([
      { contactId: "c-1", contactInboxId: "ci-1" },
      { contactId: "c-2", contactInboxId: "ci-2" },
    ])

    await expect(
      resolve("webchat", { fullName: "An Nguyen" }),
    ).resolves.toEqual({
      skipReason: "contactAmbiguous",
    })
    expect(mocks.createContactWithInbox).not.toHaveBeenCalled()
  })

  test("a WhatsApp wa_id in any spelling finds the contact by its digits", async () => {
    mocks.findLatestBySource.mockResolvedValue({ id: "ci-2", contactId: "c-2" })

    await resolve("whatsapp", { channelUserId: "+84 901-234-567" })

    expect(mocks.findLatestBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "84901234567" }),
    )
  })

  test("Threads usernames are matched lower-cased, as they are stored", async () => {
    await resolve("threads", { channelUserId: "MixedCase" })

    expect(mocks.findLatestBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "mixedcase" }),
    )
  })

  test("a missing identity of every kind is skipped", async () => {
    await expect(resolve("messenger", {})).resolves.toEqual({
      skipReason: "missingIdentifier",
    })
    expect(mocks.findLatestBySource).not.toHaveBeenCalled()
  })
})

describe("creating the contact", () => {
  test("creates Contact + ContactInbox + Conversation on this inbox under a per-inbox lock", async () => {
    const result = await resolve("messenger", { channelUserId: "psid-1" })

    expect(result).toEqual({
      contactId: "c-new",
      contactInboxId: "ci-new",
      isNew: true,
    })
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "inbound-webhook-contact-create-ws-1-inbox-1",
        timeoutInSeconds: 15,
        retryTimeoutInSeconds: 15,
      }),
    )
    expect(mocks.createContactWithInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      source: "inboundWebhook",
      phoneUniqueness: "inbox",
      input: {
        inboxId: "inbox-1",
        channel: "messenger",
        contactId: "psid-1",
        phoneNumber: undefined,
        email: "",
        gender: "unknown",
        firstName: "John",
      },
    })
  })

  test("a phone-only WhatsApp contact is created without an email", async () => {
    await resolve("whatsapp", { phoneE164: "+84901234567" })

    expect(mocks.createContactWithInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          channel: "whatsapp",
          phoneNumber: "+84901234567",
          email: "",
        }),
      }),
    )
  })

  test("re-checks inside the lock, so a concurrent delivery for the same person creates nothing", async () => {
    mocks.findLatestBySource
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "ci-won", contactId: "c-won" })

    const result = await resolve("messenger", { channelUserId: "psid-1" })

    expect(result).toEqual({
      contactId: "c-won",
      contactInboxId: "ci-won",
      isNew: false,
    })
    expect(mocks.createContactWithInbox).not.toHaveBeenCalled()
  })

  test("a creator outside the lock winning the race is adopted, not an error", async () => {
    mocks.createContactWithInbox.mockRejectedValue(alreadyOnInbox())
    mocks.findLatestBySource
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "ci-msg", contactId: "c-msg" })

    const result = await resolve("messenger", { channelUserId: "psid-1" })

    expect(result).toEqual({
      contactId: "c-msg",
      contactInboxId: "ci-msg",
      isNew: false,
    })
  })

  test("a unique violation on (inbox, sourceId) is treated as the same race", async () => {
    mocks.createContactWithInbox.mockRejectedValue(
      uniqueViolation("ContactInbox_inboxId_sourceId_key"),
    )
    mocks.findLatestBySource
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "ci-msg", contactId: "c-msg" })

    await expect(
      resolve("messenger", { channelUserId: "psid-1" }),
    ).resolves.toMatchObject({ contactId: "c-msg", isNew: false })
  })

  test("a unique violation on any other constraint is not a race and propagates", async () => {
    const error = uniqueViolation("Contact_something_else_key")
    mocks.createContactWithInbox.mockRejectedValue(error)

    await expect(
      resolve("messenger", { channelUserId: "psid-1" }),
    ).rejects.toBe(error)
    expect(mocks.findLatestBySource).toHaveBeenCalledTimes(3)
  })

  test("rethrows the original error when the race winner cannot be found", async () => {
    const error = alreadyOnInbox()
    mocks.createContactWithInbox.mockRejectedValue(error)

    await expect(
      resolve("messenger", { channelUserId: "psid-1" }),
    ).rejects.toBe(error)
  })

  test("does not swallow unrelated failures", async () => {
    mocks.createContactWithInbox.mockRejectedValue(
      new ChatbotXException(
        "Please include the country code",
        "validation",
        422,
      ),
    )

    await expect(
      resolve("whatsapp", { phoneE164: "+84901234567" }),
    ).rejects.toThrow("Please include the country code")
    expect(mocks.findLatestBySource).toHaveBeenCalledTimes(3)
  })

  test("a lock that cannot be acquired fails the request so it is retried", async () => {
    mocks.runExclusive.mockRejectedValue(new Error("lock timeout"))

    await expect(
      resolve("messenger", { channelUserId: "psid-1" }),
    ).rejects.toThrow("lock timeout")
    expect(mocks.createContactWithInbox).not.toHaveBeenCalled()
  })
})

describe("a contact that cannot be created from what the payload carries", () => {
  test.each([
    ["messenger", { phoneE164: "+84901234567" }],
    ["messenger", { email: "a@b.co" }],
    ["messenger", { fullName: "An Nguyen" }],
    ["whatsapp", { channelUserId: "x", email: "a@b.co" }],
    ["whatsapp", { fullName: "An" }],
    ["smtp", { fullName: "An" }],
    ["webchat", { channelUserId: "x" }],
    ["webchat", { fullName: "An" }],
  ])("%s with %j that matches nobody is skipped as contactNotFound", async (channel, identities) => {
    await expect(resolve(channel, identities)).resolves.toEqual({
      skipReason: "contactNotFound",
    })
    expect(mocks.createContactWithInbox).not.toHaveBeenCalled()
    expect(mocks.runExclusive).not.toHaveBeenCalled()
  })

  test("the same payload updates the contact when it already exists", async () => {
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-9",
      contactInboxId: "ci-9",
    })

    await expect(
      resolve("messenger", { phoneE164: "+84901234567" }),
    ).resolves.toMatchObject({ contactId: "c-9", isNew: false })
  })
})

describe("an identity that cannot start a contact but sits next to one that can", () => {
  test("a phone-first Messenger request with a new PSID creates the contact by PSID", async () => {
    const result = await resolve("messenger", {
      phoneE164: "+84901234567",
      channelUserId: "psid-9",
    })
    // channelUserId outranks phone, so it is the lookup and the creation key.
    expect(result).toMatchObject({ isNew: true })
    expect(mocks.findByIdentity).not.toHaveBeenCalled()
  })

  test.each([
    ["messenger", { fullName: "An Nguyen", channelUserId: "psid-9" }],
  ])("%s collision on the creation id resolves to that owner, never a failure", async (channel, identities) => {
    mocks.createContactWithInbox.mockRejectedValue(alreadyOnInbox())
    mocks.findLatestBySource
      .mockResolvedValueOnce(undefined) // lookup by channelUserId
      .mockResolvedValueOnce(undefined) // in-lock re-check (lookup)
      .mockResolvedValueOnce(undefined) // in-lock re-check (creation owner)
      .mockResolvedValueOnce({ id: "ci-own", contactId: "c-own" }) // after the race

    await expect(resolve(channel, identities)).resolves.toEqual({
      contactId: "c-own",
      contactInboxId: "ci-own",
      isNew: false,
    })
  })

  test("WhatsApp: the phone's wa_id is already owned, so that contact is adopted", async () => {
    // lookup is by phone => same source id as the creation id.
    mocks.findLatestBySource.mockResolvedValue({ id: "ci-y", contactId: "c-y" })

    await expect(
      resolve("whatsapp", {
        phoneE164: "+84901234567",
        fullName: "Other Name",
      }),
    ).resolves.toMatchObject({ contactId: "c-y", isNew: false })
    expect(mocks.createContactWithInbox).not.toHaveBeenCalled()
  })

  test("webchat has no source id to collide on, so a phone already on the inbox is adopted instead of duplicated", async () => {
    // The channel user id is an unknown minted id; the phone belongs to Y.
    mocks.findLatestBySource.mockResolvedValue(undefined)
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-y",
      contactInboxId: "ci-y",
    })

    const result = await resolve("webchat", {
      channelUserId: "unknown-minted-id",
      phoneE164: "+84901234567",
    })

    expect(result).toEqual({
      contactId: "c-y",
      contactInboxId: "ci-y",
      isNew: false,
    })
    expect(mocks.createContactWithInbox).not.toHaveBeenCalled()
    expect(mocks.findByIdentity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      field: "phoneNumber",
      value: "+84901234567",
      email: undefined,
    })
  })
})

describe("creation-owner adoption never falls through to a looser identity", () => {
  test("webchat: a phone-first request is not adopted by a contact that only matches the email", async () => {
    // No contact has the phone; a contact has the email.
    mocks.findByIdentity.mockImplementation(
      async (query: { phoneNumber?: string; email?: string }) =>
        query.email && !query.phoneNumber
          ? { contactId: "c-email", contactInboxId: "ci-email" }
          : null,
    )

    const result = await resolve("webchat", {
      phoneE164: "+84901234567",
      email: "someone@example.com",
    })

    expect(result).toMatchObject({ contactId: "c-new", isNew: true })
    for (const [query] of mocks.findByIdentity.mock.calls) {
      expect(query).not.toHaveProperty("email")
    }
  })

  test("webchat: with no phone, the email is the creation identity that gets matched", async () => {
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-email",
      contactInboxId: "ci-email",
    })

    await expect(
      resolve("webchat", { email: "someone@example.com" }),
    ).resolves.toMatchObject({ contactId: "c-email", isNew: false })
  })
})

describe("a channel user id the channel cannot use as a key", () => {
  test("omnichannel alone has no usable identity at all", async () => {
    await expect(
      resolve("omnichannel", { channelUserId: "x" }),
    ).resolves.toEqual({ skipReason: "missingIdentifier" })
  })

  test("omnichannel ignores it and searches by the next identity", async () => {
    mocks.findByIdentity.mockResolvedValue({
      contactId: "c-9",
      contactInboxId: "ci-9",
    })

    await resolve("omnichannel", {
      channelUserId: "x",
      phoneE164: "+84901234567",
    })

    expect(mocks.findLatestBySource).not.toHaveBeenCalled()
    expect(mocks.findByIdentity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      field: "phoneNumber",
      value: "+84901234567",
    })
  })

  test("a WhatsApp wa_id without digits falls to the phone, which is the creation key anyway", async () => {
    mocks.findLatestBySource.mockResolvedValue({ id: "ci-y", contactId: "c-y" })

    await resolve("whatsapp", {
      channelUserId: "n/a",
      phoneE164: "+84901234567",
    })

    expect(mocks.findLatestBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "84901234567" }),
    )
  })
})
