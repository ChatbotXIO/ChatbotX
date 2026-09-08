import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditChannelConnected: vi.fn().mockResolvedValue(undefined),
  bindSignupSessionWorkspace: vi.fn(),
  claimSignupSessionPhoneNumber: vi.fn(),
  connectChannelIntegration: vi.fn(),
  createId: vi.fn(() => "generated-id"),
  createRun: vi.fn(),
  createWorkspace: vi.fn(),
  dispatchAuditRecordSafely: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn(),
  runConnectTransaction: vi.fn(),
  transaction: vi.fn(),
  upsertByInbox: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    upsertByInbox: mocks.upsertByInbox,
  },
  whatsappSignupSessionRepository: {
    bindSignupSessionWorkspace: mocks.bindSignupSessionWorkspace,
    claimSignupSessionPhoneNumber: mocks.claimSignupSessionPhoneNumber,
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: mocks.createId }
})

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecordSafely: mocks.dispatchAuditRecordSafely,
}))

vi.mock("../src/inbox/connect-channel", () => ({
  auditChannelConnected: mocks.auditChannelConnected,
  connectChannelIntegration: mocks.connectChannelIntegration,
  runConnectTransaction: mocks.runConnectTransaction,
}))

vi.mock("../src/coexist/service", () => ({
  coexistService: { createRun: mocks.createRun, markFailed: mocks.markFailed },
}))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)
const { workspaceService } = await import("../src/workspace/service")

const tx = { tx: true }

function mockConnectChannelIntegration(wasCreated: boolean) {
  mocks.connectChannelIntegration.mockImplementation(
    async ({
      insertIntegration,
    }: {
      insertIntegration: (
        inboxId: string,
        wasCreated: boolean,
      ) => Promise<unknown>
    }) => {
      const integration = await insertIntegration("inbox-1", wasCreated)
      return { inbox: { id: "inbox-1" }, wasCreated, integration }
    },
  )
}

const basePhoneNumberInput = {
  actorUserId: "user-1",
  ownerId: "owner-1",
  integrationId: "integration-1",
  phoneNumber: { id: "pn-1", name: "Acme", displayPhoneNumber: "+1 555" },
  wabaId: "waba-1",
  businessId: "business-1",
  auth: {},
  isCoexist: false,
  platformType: "",
}

describe("integrationWhatsappService.connectPhoneNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dispatchAuditRecordSafely.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )
    mocks.upsertByInbox.mockResolvedValue({
      id: "integration-1",
      workspaceId: "workspace-1",
      phoneNumberId: "pn-1",
    })
    mockConnectChannelIntegration(true)
    // Pass-through — the constraint→channelDuplicatedException mapping is
    // runConnectTransaction's own job, covered by connect-channel.test.ts.
    // `auditChannelConnected` keeps its default resolved-undefined mock —
    // its own payload/log strings are covered there too. `dispatchAuditRecordSafely`
    // stays mocked here only for the workspace-create audit, which this
    // service calls directly (not through `auditChannelConnected`).
    mocks.runConnectTransaction.mockImplementation(
      (_channel: string, body: (tx: unknown) => Promise<unknown>) =>
        mocks.transaction(body),
    )
  })

  test("claims the phone number from the signup session inside the transaction", async () => {
    mocks.claimSignupSessionPhoneNumber.mockResolvedValue({
      id: "session-1",
      workspaceId: "workspace-1",
    })

    await integrationWhatsappService.connectPhoneNumber({
      ...basePhoneNumberInput,
      workspaceId: "workspace-1",
      signupSession: { id: "session-1", userId: "user-1", ownerId: "owner-1" },
    })

    expect(mocks.claimSignupSessionPhoneNumber).toHaveBeenCalledWith({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "pn-1",
      tx,
    })
  })

  test("a null claim raises a session-level signupSessionExpired error and stops before any insert", async () => {
    mocks.claimSignupSessionPhoneNumber.mockResolvedValue(null)

    await expect(
      integrationWhatsappService.connectPhoneNumber({
        ...basePhoneNumberInput,
        workspaceId: "workspace-1",
        signupSession: {
          id: "session-1",
          userId: "user-1",
          ownerId: "owner-1",
        },
      }),
    ).rejects.toMatchObject({ code: "signupSessionExpired" })

    expect(mocks.upsertByInbox).not.toHaveBeenCalled()
  })

  test("a failure inside the transaction after a successful claim propagates, and a retry claims again and succeeds", async () => {
    // The transaction callback actually runs this time (unlike a bare
    // `db.transaction` rejection): the claim succeeds, then the upsert that
    // follows it throws, so the callback's own promise rejects — this is
    // what a real Postgres ROLLBACK looks like from the caller's side (the
    // claim's UPDATE never committed).
    mocks.claimSignupSessionPhoneNumber.mockResolvedValueOnce({
      id: "session-1",
      workspaceId: "workspace-1",
    })
    mocks.upsertByInbox.mockRejectedValueOnce(new Error("db exploded"))
    mocks.transaction.mockImplementationOnce(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )

    await expect(
      integrationWhatsappService.connectPhoneNumber({
        ...basePhoneNumberInput,
        workspaceId: "workspace-1",
        signupSession: {
          id: "session-1",
          userId: "user-1",
          ownerId: "owner-1",
        },
      }),
    ).rejects.toThrow("db exploded")

    expect(mocks.claimSignupSessionPhoneNumber).toHaveBeenCalledTimes(1)

    // Retry: a fresh transaction claims the same number again (the mocked
    // rollback above never actually persisted the claim) and this time the
    // upsert succeeds.
    mocks.claimSignupSessionPhoneNumber.mockResolvedValueOnce({
      id: "session-1",
      workspaceId: "workspace-1",
    })
    mocks.upsertByInbox.mockResolvedValueOnce({
      id: "integration-1",
      workspaceId: "workspace-1",
      phoneNumberId: "pn-1",
    })
    mocks.transaction.mockImplementationOnce(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )

    await expect(
      integrationWhatsappService.connectPhoneNumber({
        ...basePhoneNumberInput,
        workspaceId: "workspace-1",
        signupSession: {
          id: "session-1",
          userId: "user-1",
          ownerId: "owner-1",
        },
      }),
    ).resolves.toMatchObject({ workspaceId: "workspace-1" })

    expect(mocks.claimSignupSessionPhoneNumber).toHaveBeenCalledTimes(2)
  })

  test("creates a workspace and binds the session only when workspaceId is null", async () => {
    vi.spyOn(workspaceService, "create").mockResolvedValue({
      id: "workspace-new",
    } as never)
    mocks.claimSignupSessionPhoneNumber.mockResolvedValue({ id: "session-1" })

    const result = await integrationWhatsappService.connectPhoneNumber({
      ...basePhoneNumberInput,
      workspaceId: null,
      signupSession: { id: "session-1", userId: "user-1", ownerId: "owner-1" },
    })

    expect(workspaceService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        createdBy: "user-1",
        data: expect.objectContaining({ name: "Acme", ownerId: "user-1" }),
      }),
    )
    expect(mocks.bindSignupSessionWorkspace).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "workspace-new",
      tx,
    })
    expect(result.createdWorkspace).toBe(true)
    expect(result.workspaceId).toBe("workspace-new")
    expect(mocks.dispatchAuditRecordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        detail: "created the workspace (#workspace-new)",
      }),
      expect.any(String),
    )
  })

  test("does not create a workspace or bind the session when workspaceId is already set", async () => {
    mocks.claimSignupSessionPhoneNumber.mockResolvedValue({
      id: "session-1",
      workspaceId: "workspace-1",
    })

    const result = await integrationWhatsappService.connectPhoneNumber({
      ...basePhoneNumberInput,
      workspaceId: "workspace-1",
      signupSession: { id: "session-1", userId: "user-1", ownerId: "owner-1" },
    })

    expect(mocks.bindSignupSessionWorkspace).not.toHaveBeenCalled()
    expect(result.createdWorkspace).toBe(false)
    expect(mocks.dispatchAuditRecordSafely).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "create" }),
      expect.any(String),
    )
  })

  test("trusts the CLAIMED row's workspaceId over a stale null on the caller's input", async () => {
    // The caller read the session before the transaction started and saw a
    // null workspaceId; a concurrent request in the same batch has since
    // bound one via bindSignupSessionWorkspace. The row-locked claim sees
    // the up-to-date value, so this request must reuse it instead of
    // creating a second workspace.
    vi.spyOn(workspaceService, "create")
    mocks.claimSignupSessionPhoneNumber.mockResolvedValue({
      id: "session-1",
      workspaceId: "workspace-already-bound",
    })

    const result = await integrationWhatsappService.connectPhoneNumber({
      ...basePhoneNumberInput,
      workspaceId: null,
      signupSession: { id: "session-1", userId: "user-1", ownerId: "owner-1" },
    })

    expect(workspaceService.create).not.toHaveBeenCalled()
    expect(mocks.bindSignupSessionWorkspace).not.toHaveBeenCalled()
    expect(result.createdWorkspace).toBe(false)
    expect(result.workspaceId).toBe("workspace-already-bound")
  })

  test("dispatches a connect audit only when wasCreated is true", async () => {
    mockConnectChannelIntegration(false)

    await integrationWhatsappService.connectPhoneNumber({
      ...basePhoneNumberInput,
      workspaceId: "workspace-1",
    })

    expect(mocks.auditChannelConnected).not.toHaveBeenCalled()
  })

  test("connects via the shared channel-connect audit helper, not the raw dispatcher, when wasCreated is true", async () => {
    await integrationWhatsappService.connectPhoneNumber({
      ...basePhoneNumberInput,
      workspaceId: "workspace-1",
    })

    expect(mocks.auditChannelConnected).toHaveBeenCalledWith({
      channel: "whatsapp",
      actorUserId: "user-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
    })
  })

  // dispatchAuditRecordSafely's own "never rejects even when the underlying
  // dispatch throws" guarantee is tested once, centrally, in
  // audit-dispatcher.test.ts; auditChannelConnected's own payload/log
  // strings are covered in connect-channel.test.ts. This only guards that
  // the workspace-create audit still goes through the safe wrapper directly
  // (it isn't routed through auditChannelConnected — that's connect-only),
  // and that the connect audit fires through auditChannelConnected exactly
  // once alongside it.
  test("dispatches the workspace-create audit via the safe wrapper and the connect audit via auditChannelConnected", async () => {
    vi.spyOn(workspaceService, "create").mockResolvedValue({
      id: "workspace-new",
    } as never)
    mocks.claimSignupSessionPhoneNumber.mockResolvedValue({ id: "session-1" })

    await expect(
      integrationWhatsappService.connectPhoneNumber({
        ...basePhoneNumberInput,
        workspaceId: null,
        signupSession: {
          id: "session-1",
          userId: "user-1",
          ownerId: "owner-1",
        },
      }),
    ).resolves.toMatchObject({ workspaceId: "workspace-new" })
    expect(mocks.dispatchAuditRecordSafely).toHaveBeenCalledOnce()
    expect(mocks.auditChannelConnected).toHaveBeenCalledOnce()
  })

  // The constraint→channelDuplicatedException mapping (and the audit
  // payload/log strings) are runConnectTransaction's / auditChannelConnected's
  // own contracts, exhaustively covered in connect-channel.test.ts — this
  // only guards that connectPhoneNumber propagates whatever the transaction
  // rejects with, rather than swallowing it.
  test("a transaction rejection propagates", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("connection reset"))

    await expect(
      integrationWhatsappService.connectPhoneNumber({
        ...basePhoneNumberInput,
        workspaceId: "workspace-1",
      }),
    ).rejects.toThrow("connection reset")
  })

  test("upserts the integration row by inboxId", async () => {
    await integrationWhatsappService.connectPhoneNumber({
      ...basePhoneNumberInput,
      workspaceId: "workspace-1",
    })

    expect(mocks.upsertByInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "integration-1",
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        phoneNumberId: "pn-1",
        wabaId: "waba-1",
        businessId: "business-1",
        displayPhoneNumber: "+1 555",
      }),
      tx,
    )
  })
})
