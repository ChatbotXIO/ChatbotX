import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ inboxFind: vi.fn() }))
vi.mock("../src/inbox/service", () => ({
  inboxService: { find: mocks.inboxFind },
}))

const { resolveEffectiveChannel, validateInboundWebhookConfig } = await import(
  "../src/inbound-webhook/effective-channel"
)

const phone = { kind: "phone" as const, jsonPath: "$.phone" }
const email = { kind: "email" as const, jsonPath: "$.email" }
const fullName = { kind: "fullName" as const, jsonPath: "$.name" }
const mapping = { target: "first_name", jsonPath: "$.first" }
const psid = { kind: "channelUserId" as const, jsonPath: "$.sender.id" }
const messengerByPage = {
  mode: "payload" as const,
  channel: "messenger" as const,
  identifierKind: "pageId" as const,
  jsonPath: "$.entry[0].id",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveEffectiveChannel", () => {
  test("uses the configured channel in payload mode without touching the database", async () => {
    await expect(
      resolveEffectiveChannel({
        workspaceId: "ws-1",
        resolution: messengerByPage,
      }),
    ).resolves.toEqual({ channel: "messenger", inbox: null })
    expect(mocks.inboxFind).not.toHaveBeenCalled()
  })

  test("takes the channel from the chosen inbox in inbox mode", async () => {
    const inbox = { id: "5", channel: "whatsapp", status: "connected" }
    mocks.inboxFind.mockResolvedValue(inbox)

    await expect(
      resolveEffectiveChannel({
        workspaceId: "ws-1",
        resolution: { mode: "inbox", inboxId: "5" },
      }),
    ).resolves.toEqual({ channel: "whatsapp", inbox })
    expect(mocks.inboxFind).toHaveBeenCalledWith({
      where: { id: "5", workspaceId: "ws-1" },
    })
  })

  test("is null when the inbox is gone", async () => {
    mocks.inboxFind.mockResolvedValue(undefined)

    await expect(
      resolveEffectiveChannel({
        workspaceId: "ws-1",
        resolution: { mode: "inbox", inboxId: "5" },
      }),
    ).resolves.toBeNull()
  })
})

describe("validateInboundWebhookConfig", () => {
  const validate = (
    overrides: Partial<Parameters<typeof validateInboundWebhookConfig>[0]>,
  ) =>
    validateInboundWebhookConfig({
      workspaceId: "ws-1",
      inboxResolution: messengerByPage,
      identifiers: [psid],
      fieldMappings: [mapping],
      ...overrides,
    })

  test("accepts a complete payload-mode config", async () => {
    await expect(validate({})).resolves.toEqual([])
  })

  test("reports every missing part of an empty config at once", async () => {
    await expect(
      validate({ inboxResolution: null, identifiers: [], fieldMappings: [] }),
    ).resolves.toEqual([
      { field: "inboxResolution", code: "inboxRequired" },
      { field: "identifiers", code: "identifierRequired" },
      { field: "fieldMappings", code: "fieldMappingRequired" },
    ])
  })

  test("requires at least one mapping", async () => {
    await expect(validate({ fieldMappings: [] })).resolves.toEqual([
      { field: "fieldMappings", code: "fieldMappingRequired" },
    ])
  })

  test("requires at least one contact identity", async () => {
    await expect(validate({ identifiers: [] })).resolves.toEqual([
      { field: "identifiers", code: "identifierRequired" },
    ])
  })

  test("accepts any of the four identities on any channel, creation-capable or not", async () => {
    mocks.inboxFind.mockResolvedValue({
      id: "5",
      channel: "whatsapp",
      status: "connected",
    })
    const inboxMode = { mode: "inbox" as const, inboxId: "5" }

    for (const identifier of [phone, psid, email, fullName]) {
      await expect(
        validate({ inboxResolution: inboxMode, identifiers: [identifier] }),
      ).resolves.toEqual([])
    }
  })

  test("a channel that creates no contacts can still be saved (it only updates existing ones)", async () => {
    mocks.inboxFind.mockResolvedValue({
      id: "5",
      channel: "omnichannel",
      status: "connected",
    })

    await expect(
      validate({
        inboxResolution: { mode: "inbox", inboxId: "5" },
        identifiers: [fullName],
      }),
    ).resolves.toEqual([])
  })

  test("rejects an identifier kind the channel does not offer", async () => {
    await expect(
      validate({
        inboxResolution: { ...messengerByPage, identifierKind: "igId" },
      }),
    ).resolves.toEqual([
      { field: "inboxResolution", code: "unsupportedInboxIdentifier" },
    ])
  })

  test("rejects an inbox that does not exist in the workspace", async () => {
    mocks.inboxFind.mockResolvedValue(undefined)

    await expect(
      validate({ inboxResolution: { mode: "inbox", inboxId: "404" } }),
    ).resolves.toEqual([{ field: "inboxResolution", code: "inboxNotFound" }])
  })

  test("rejects a disconnected inbox", async () => {
    mocks.inboxFind.mockResolvedValue({
      id: "5",
      channel: "messenger",
      status: "error",
    })

    await expect(
      validate({ inboxResolution: { mode: "inbox", inboxId: "5" } }),
    ).resolves.toEqual([
      { field: "inboxResolution", code: "inboxDisconnected" },
    ])
  })
})
