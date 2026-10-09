import { createHash } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findModelByIdForWorkspace: vi.fn(),
  resolveTemplates: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findModelByIdForWorkspace: mocks.findModelByIdForWorkspace,
  },
}))

const { buildMatchingSnapshot, loadMatchingIdentifiers } = await import(
  "../src/google-ads/customer-matching"
)

const sha = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex")

describe("buildMatchingSnapshot", () => {
  const base = {
    matchEmail: "{{email}}",
    matchPhone: undefined,
    adUserDataStatus: "granted" as const,
    uploadMethod: "dataManager" as const,
  }

  test.each([
    [undefined, undefined],
    ["", "   "],
  ])("nothing configured (%j, %j) keeps the event click-only", (matchEmail, matchPhone) => {
    expect(
      buildMatchingSnapshot({ ...base, matchEmail, matchPhone }),
    ).toBeUndefined()
  })

  test.each([
    ["a stale dropdown value", "off"],
    ["a custom field id", "11690032856629248"],
    ["a literal e-mail", "jane@example.com"],
    ["text around the variable", "mail {{email}}"],
    ["an over-long variable", `{{${"a".repeat(197)}}}`],
  ])("%s is not configured: never recorded, resolved or hashed", (_label, value) => {
    expect(
      buildMatchingSnapshot({ ...base, matchEmail: value, matchPhone: value }),
    ).toBeUndefined()
    expect(
      buildMatchingSnapshot({
        ...base,
        matchEmail: value,
        matchPhone: "{{phone}}",
      }),
    ).toEqual({ status: "enabled", email: null, phone: "{{phone}}" })
  })

  test("a recorded snapshot always passes the stored-options schema, whatever the step held", async () => {
    const { googleAdsMatchingSnapshotSchema } = await import(
      "@chatbotx.io/database/partials"
    )
    const longest = `{{${"a".repeat(196)}}}`
    const snapshot = buildMatchingSnapshot({
      ...base,
      matchEmail: longest,
      matchPhone: `{{${"b".repeat(400)}}}`,
    })

    expect(googleAdsMatchingSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
  })

  test("records the variables, never any value", () => {
    expect(
      buildMatchingSnapshot({ ...base, matchPhone: " {{phone}} " }),
    ).toEqual({ status: "enabled", email: "{{email}}", phone: "{{phone}}" })
  })

  test("a blank identifier is recorded as not configured", () => {
    expect(buildMatchingSnapshot({ ...base, matchPhone: "  " })).toEqual({
      status: "enabled",
      email: "{{email}}",
      phone: null,
    })
  })

  test.each([
    ["granted", "enabled"],
    ["denied", "withheldConsent"],
    [null, "withheldConsent"],
  ] as const)("ad user data %s -> %s", (adUserDataStatus, status) => {
    expect(buildMatchingSnapshot({ ...base, adUserDataStatus })?.status).toBe(
      status,
    )
  })

  test("the legacy transport never carries matching", () => {
    expect(
      buildMatchingSnapshot({ ...base, uploadMethod: "legacy" })?.status,
    ).toBe("unsupportedTransport")
  })
})

describe("loadMatchingIdentifiers", () => {
  const event = { workspaceId: "ws-1", contactInboxId: "ci-1" }
  const inbox = { id: "ci-1", contactId: "c-1" }
  const enabled = {
    status: "enabled" as const,
    email: "{{email}}",
    phone: "{{phone}}",
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.findModelByIdForWorkspace.mockResolvedValue(inbox)
    mocks.resolveTemplates.mockResolvedValue({
      email: "Jane.Doe@Example.com",
      phone: "+14155552671",
    })
  })

  test("hashes what the resolver returns for the event's contact, scoped to its workspace", async () => {
    expect(
      await loadMatchingIdentifiers(event, enabled, mocks.resolveTemplates),
    ).toEqual({
      emailAddress: sha("jane.doe@example.com"),
      phoneNumber: sha("+14155552671"),
    })
    expect(mocks.findModelByIdForWorkspace).toHaveBeenCalledWith({
      id: "ci-1",
      workspaceId: "ws-1",
    })
    expect(mocks.resolveTemplates).toHaveBeenCalledWith({
      contactId: "c-1",
      contactInbox: inbox,
      templates: { email: "{{email}}", phone: "{{phone}}" },
    })
  })

  test("reads the CURRENT value: an edit between attempts changes the identifier", async () => {
    const first = await loadMatchingIdentifiers(
      event,
      enabled,
      mocks.resolveTemplates,
    )
    mocks.resolveTemplates.mockResolvedValue({ email: "new@example.com" })
    const second = await loadMatchingIdentifiers(
      event,
      enabled,
      mocks.resolveTemplates,
    )

    expect(first?.emailAddress).not.toBe(second?.emailAddress)
    expect(second).toEqual({ emailAddress: sha("new@example.com") })
  })

  test.each([
    ["withheld by consent", { ...enabled, status: "withheldConsent" as const }],
    [
      "unsupported on legacy",
      { ...enabled, status: "unsupportedTransport" as const },
    ],
    ["not recorded at all", undefined],
  ])("%s loads nothing and touches no data", async (_label, matching) => {
    expect(
      await loadMatchingIdentifiers(event, matching, mocks.resolveTemplates),
    ).toBeUndefined()
    expect(mocks.findModelByIdForWorkspace).not.toHaveBeenCalled()
    expect(mocks.resolveTemplates).not.toHaveBeenCalled()
  })

  test("without a resolver nothing is sent", async () => {
    expect(
      await loadMatchingIdentifiers(event, enabled, undefined),
    ).toBeUndefined()
    expect(mocks.findModelByIdForWorkspace).not.toHaveBeenCalled()
  })

  test("an event without a contact inbox, or one of another workspace, yields nothing", async () => {
    expect(
      await loadMatchingIdentifiers(
        { workspaceId: "ws-1", contactInboxId: null },
        enabled,
        mocks.resolveTemplates,
      ),
    ).toBeUndefined()

    mocks.findModelByIdForWorkspace.mockResolvedValue(null)
    expect(
      await loadMatchingIdentifiers(event, enabled, mocks.resolveTemplates),
    ).toBeUndefined()
    expect(mocks.resolveTemplates).not.toHaveBeenCalled()
  })

  test("empty or invalid values degrade to fewer identifiers, down to none", async () => {
    mocks.resolveTemplates.mockResolvedValue({
      email: null,
      phone: "0901234567",
    })
    expect(
      await loadMatchingIdentifiers(event, enabled, mocks.resolveTemplates),
    ).toBeUndefined()

    mocks.resolveTemplates.mockResolvedValue({ email: "a@b.co", phone: null })
    expect(
      await loadMatchingIdentifiers(event, enabled, mocks.resolveTemplates),
    ).toEqual({ emailAddress: sha("a@b.co") })
  })

  test("a resolver failure propagates so delivery retries instead of dropping the identifiers", async () => {
    mocks.resolveTemplates.mockRejectedValue(new Error("db down"))

    await expect(
      loadMatchingIdentifiers(event, enabled, mocks.resolveTemplates),
    ).rejects.toThrow("db down")
  })
})
