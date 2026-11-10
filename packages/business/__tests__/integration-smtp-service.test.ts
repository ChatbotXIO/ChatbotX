// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDelete,
  mockDisconnect,
  mockDispatchAuditRecord,
  mockFindOrFail,
  mockRecordPollFailure,
  mockRecordPollSuccess,
  mockSetInboundToken,
  mockSetInboundTokenIfUnset,
  mockInboxCreate,
  mockTransaction,
  mockUpdate,
  mockUpdateReturning,
  mockUpdateWhere,
  mockUpsertConnectionRow,
  mockWithQuotaCompensation,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockUpdateReturning = vi.fn(async () => [
    { id: "smtp-1", name: "updated", fromAddress: "a@b.com" },
  ])
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  return {
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockDispatchAuditRecord: vi.fn(async () => undefined),
    mockFindOrFail: vi.fn(),
    mockRecordPollFailure: vi.fn(async () => undefined),
    mockRecordPollSuccess: vi.fn(async () => undefined),
    mockSetInboundToken: vi.fn(),
    mockSetInboundTokenIfUnset: vi.fn(),
    mockInboxCreate: vi.fn(async () => ({
      inbox: { id: "smtp-1" },
      wasCreated: true,
    })),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: mockDelete, update: mockUpdate }),
    ),
    mockUpdate,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpsertConnectionRow: vi.fn(async () => ({ id: "conn-1" })),
    mockWithQuotaCompensation: vi.fn(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
    update: mockUpdate,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationSmtpRepository: {
    recordPollFailure: mockRecordPollFailure,
    recordPollSuccess: mockRecordPollSuccess,
    setInboundToken: mockSetInboundToken,
    setInboundTokenIfUnset: mockSetInboundTokenIfUnset,
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { smtp: "smtp" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationSmtpModel: { id: "id", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "smtp-1",
}))

vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: { smtp: { duplicateConstraint: undefined } },
  upsertConnectionRow: mockUpsertConnectionRow,
  withQuotaCompensation: mockWithQuotaCompensation,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { create: mockInboxCreate, disconnect: mockDisconnect },
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: mockDisconnect },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { integrationSmtpService, toResource } = await import(
  "../src/integration-smtp/service"
)

const auth = {
  authType: "custom" as const,
  provider: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  username: "user",
  password: "pass",
}

describe("integrationSmtpService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ delete: mockDelete, update: mockUpdate }),
    )
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "smtp-1" },
      wasCreated: true,
    })
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" })
  })

  test("passes auth through untouched, fromAddress and a disabled IMAP block as extraConfig", async () => {
    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
    })

    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "smtp",
        auth,
        extraConfig: {
          fromAddress: "from@example.com",
          imapEnabled: false,
          imapHost: null,
          imapPort: null,
          imapMailbox: null,
        },
        inboxId: "smtp-1",
        ownerId: "owner-1",
      }),
    )
  })

  test("persists the IMAP settings given at connect time", async () => {
    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
      imap: {
        enabled: true,
        host: "imap.gmail.com",
        port: 993,
        mailbox: "INBOX",
      },
    })

    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        extraConfig: {
          fromAddress: "from@example.com",
          imapEnabled: true,
          imapHost: "imap.gmail.com",
          imapPort: 993,
          imapMailbox: "INBOX",
        },
      }),
    )
  })

  // The audit record belongs to the service, not the calling action, so a
  // public-API or worker caller gets it too.
  test("records the connect audit when the channel was created", async () => {
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })

    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "connect",
      detail: "connected a new SMTP channel (#inbox-1)",
    })
  })

  test("records no audit when an existing inbox was reused", async () => {
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: false,
    })

    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("integrationSmtpService.update", () => {
  const existing = {
    id: "smtp-1",
    workspaceId: "ws-1",
    inboxId: "inbox-1",
    name: "user",
    fromAddress: "from@example.com",
    auth,
    imapEnabled: false,
    imapHost: null,
    imapPort: null,
    imapMailbox: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue(existing)
    mockUpdateReturning.mockResolvedValue([
      { id: "smtp-1", name: "updated", fromAddress: "a@b.com" },
    ])
  })

  test("returns the updated row", async () => {
    const result = await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { username: "updated", fromAddress: "a@b.com" },
    })

    expect(result).toEqual({
      id: "smtp-1",
      name: "updated",
      fromAddress: "a@b.com",
    })
  })

  // The action layer pre-checks ownership via `findByIdForWorkspace`, but the
  // method takes a `workspaceId` and must scope on it itself — otherwise a
  // future caller that trusts the parameter writes across workspaces.
  test("scopes the update by workspaceId as well as id", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { username: "updated", fromAddress: "a@b.com" },
    })

    expect(mockUpdateWhere).toHaveBeenCalledWith({
      conditions: [
        { field: "id", value: "smtp-1" },
        { field: "workspaceId", value: "ws-1" },
      ],
    })
  })

  // Every omitted field falls back to the stored auth, so a partial form
  // submission never blanks out a credential.
  test("merges omitted fields from the stored auth", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { fromAddress: "a@b.com" },
    })

    expect(mockUpdateWhere).toHaveBeenCalled()
    const setArg = (
      mockUpdate.mock.results[0]?.value as { set: ReturnType<typeof vi.fn> }
    ).set
    expect(setArg).toHaveBeenCalledWith({
      auth,
      name: existing.name,
      fromAddress: "a@b.com",
      imapEnabled: false,
      imapHost: null,
      imapPort: null,
      imapMailbox: null,
    })
  })

  const lastSetArg = () =>
    (
      mockUpdate.mock.results[0]?.value as {
        set: ReturnType<typeof vi.fn>
      }
    ).set.mock.calls[0]?.[0]

  // A new mailbox has its own UID space: the next poll must re-baseline.
  test("enabling IMAP resets the poll cursor", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: {
        imap: {
          enabled: true,
          host: "imap.gmail.com",
          port: 993,
          mailbox: "INBOX",
        },
      },
    })

    expect(lastSetArg()).toMatchObject({
      imapEnabled: true,
      imapHost: "imap.gmail.com",
      imapUidValidity: null,
      imapLastUid: null,
      lastPollError: null,
      imapNextPollAt: null,
    })
  })

  test("an update that leaves the mailbox alone keeps the cursor", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { fromAddress: "a@b.com" },
    })

    expect(lastSetArg()).not.toHaveProperty("imapLastUid")
  })

  // The SMTP password doubles as the IMAP login unless a dedicated one is set.
  test("an SMTP password change resets the cursor only when it is also the IMAP login", async () => {
    mockFindOrFail.mockResolvedValue({ ...existing, imapEnabled: true })
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { password: "new-pass" },
    })
    expect(lastSetArg()).toHaveProperty("imapLastUid", null)

    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue({
      ...existing,
      imapEnabled: true,
      auth: { ...auth, imapUsername: "box", imapPassword: "box-pass" },
    })
    mockUpdateReturning.mockResolvedValue([{ id: "smtp-1" }])
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { password: "new-pass" },
    })
    expect(lastSetArg()).not.toHaveProperty("imapLastUid")
  })

  test("stores dedicated IMAP credentials in auth, omitting unset keys", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { imapUsername: "box@example.com", imapPassword: "box-pass" },
    })

    expect(lastSetArg().auth).toEqual({
      ...auth,
      imapUsername: "box@example.com",
      imapPassword: "box-pass",
    })
  })

  test("records the update audit when the payload actually changed", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { fromAddress: "changed@example.com" },
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "updated the SMTP channel configuration",
    })
  })

  // Re-submitting the form untouched must not spam the audit trail.
  test("records no audit when the resolved payload is unchanged", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: {
        provider: auth.provider,
        host: auth.host,
        port: auth.port,
        username: existing.name,
        password: auth.password,
        fromAddress: existing.fromAddress,
      },
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("integrationSmtpService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes then calls inboxService.disconnect", async () => {
    const callOrder: string[] = []
    const tx = {
      delete: vi.fn(() => {
        callOrder.push("delete")
        return { where: vi.fn(async () => undefined) }
      }),
    }
    mockDisconnect.mockImplementation(() => {
      callOrder.push("inbox-disconnect")
      return Promise.resolve()
    })

    await integrationSmtpService.disconnect({
      workspaceId: "ws-1",
      id: "smtp-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
      tx: tx as never,
    })

    expect(callOrder).toEqual(["delete", "inbox-disconnect"])
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "disconnect",
      detail: "disconnected the SMTP channel (#smtp-1)",
    })
  })
})

describe("integrationSmtpService IMAP poll bookkeeping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("recordPollFailure truncates the error and schedules a back-off", async () => {
    const before = Date.now()
    await integrationSmtpService.recordPollFailure({
      id: "smtp-1",
      error: "x".repeat(2000),
    })

    const arg = mockRecordPollFailure.mock.calls[0]?.[0] as {
      error: string
      polledAt: Date
      nextPollAt: Date
    }
    expect(arg.error).toHaveLength(500)
    expect(arg.nextPollAt.getTime()).toBeGreaterThanOrEqual(
      before + 10 * 60 * 1000,
    )
  })

  test("recordPollSuccess stamps the poll time with the new cursor", async () => {
    await integrationSmtpService.recordPollSuccess({
      id: "smtp-1",
      uidValidity: 7,
      lastUid: 42,
    })

    expect(mockRecordPollSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "smtp-1",
        uidValidity: 7,
        lastUid: 42,
        polledAt: expect.any(Date),
      }),
    )
  })
})

describe("toResource", () => {
  test("projects only public fields: the stored auth (passwords) never leaks", () => {
    const row = {
      id: "smtp-1",
      name: "user",
      fromAddress: "from@example.com",
      imapEnabled: true,
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapMailbox: "INBOX",
      lastPolledAt: null,
      lastPollError: null,
      auth: {
        provider: "postmark",
        password: "super-secret",
        imapPassword: "box-secret",
      },
      inboundToken: "url-secret",
      workspaceId: "ws-1",
    }

    const resource = toResource(row as never)

    expect(Object.keys(resource).sort()).toEqual(
      [
        "fromAddress",
        "id",
        "imapEnabled",
        "imapHost",
        "imapMailbox",
        "imapPort",
        "inboundWebhookIssued",
        "lastPollError",
        "lastPolledAt",
        "name",
        "provider",
      ].sort(),
    )
    expect(resource).toMatchObject({
      provider: "postmark",
      inboundWebhookIssued: true,
    })
    expect(JSON.stringify(resource)).not.toContain("secret")
  })
})

const HEX_TOKEN = /^[0-9a-f]{64}$/

describe("integrationSmtpService inbound webhook token", () => {
  beforeEach(() => {
    mockSetInboundToken.mockReset()
    mockSetInboundTokenIfUnset.mockReset()
    mockSetInboundTokenIfUnset.mockImplementation(
      async (props: { token: string }) => ({
        id: "smtp-1",
        inboundToken: props.token,
      }),
    )
    mockSetInboundToken.mockImplementation(
      async (props: { token: string }) => ({ id: "smtp-1", ...props }),
    )
  })

  test("getOrCreateInboundToken reuses an existing token without writing", async () => {
    mockFindOrFail.mockResolvedValueOnce({ id: "smtp-1", inboundToken: "abc" })

    const token = await integrationSmtpService.getOrCreateInboundToken({
      workspaceId: "ws-1",
      id: "smtp-1",
    })

    expect(token).toBe("abc")
    expect(mockSetInboundToken).not.toHaveBeenCalled()
  })

  test("getOrCreateInboundToken mints a 256-bit hex token on first use", async () => {
    mockFindOrFail.mockResolvedValue({ id: "smtp-1", inboundToken: null })

    const token = await integrationSmtpService.getOrCreateInboundToken({
      workspaceId: "ws-1",
      id: "smtp-1",
    })

    expect(token).toMatch(HEX_TOKEN)
    expect(mockSetInboundTokenIfUnset).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "smtp-1",
      token,
    })
  })

  test("getOrCreateInboundToken returns the winner's token when it loses a concurrent mint", async () => {
    mockFindOrFail
      .mockResolvedValueOnce({ id: "smtp-1", inboundToken: null })
      .mockResolvedValueOnce({ id: "smtp-1", inboundToken: "winner" })
    mockSetInboundTokenIfUnset.mockResolvedValueOnce(undefined)

    const token = await integrationSmtpService.getOrCreateInboundToken({
      workspaceId: "ws-1",
      id: "smtp-1",
    })

    expect(token).toBe("winner")
  })

  test("rotateInboundToken always replaces the token", async () => {
    mockFindOrFail.mockResolvedValue({ id: "smtp-1", inboundToken: "old" })

    const token = await integrationSmtpService.rotateInboundToken({
      workspaceId: "ws-1",
      id: "smtp-1",
    })

    expect(token).not.toBe("old")
    expect(mockSetInboundToken).toHaveBeenCalledTimes(1)
  })
})
