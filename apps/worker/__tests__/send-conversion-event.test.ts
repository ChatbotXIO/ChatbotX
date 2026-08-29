import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWorkspaceEvent: vi.fn(),
  updateCapiStatus: vi.fn(),
  findWorkspaceIntegration: vi.fn(),
  ensureDatasetId: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string | undefined, fn: () => Promise<void>) =>
      await fn(),
  ),
  ensureDataset: vi.fn(),
  sendConversionEvent: vi.fn(),
  defaultQueueAdd: vi.fn(),
  // Messenger/Instagram CAPI send branch (Phase 3).
  findMessengerIntegration: vi.fn(),
  findInstagramIntegration: vi.fn(),
  findContactInbox: vi.fn(),
  findContactByIdForWorkspace: vi.fn(),
  resolveCapiAccessToken: vi.fn(),
  metaEnsureDatasetId: vi.fn(),
  metaEnsureDataset: vi.fn(),
  metaSendConversionEvent: vi.fn(),
  refreshCapiScopeCache: vi.fn(),
  findWorkspaceById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    integrationWhatsappService: {
      findWorkspaceIntegration: mocks.findWorkspaceIntegration,
      ensureDatasetId: mocks.ensureDatasetId,
    },
    messengerIntegrationService: {
      findByIdForWorkspace: mocks.findMessengerIntegration,
    },
    instagramIntegrationService: {
      findByIdForWorkspace: mocks.findInstagramIntegration,
    },
    contactInboxService: {
      findByUncached: mocks.findContactInbox,
    },
    contactService: {
      findById: mocks.findContactByIdForWorkspace,
    },
    metaConversionsService: {
      ensureDatasetId: mocks.metaEnsureDatasetId,
      refreshCapiScopeCache: mocks.refreshCapiScopeCache,
    },
    resolveCapiAccessToken: mocks.resolveCapiAccessToken,
    withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
    workspaceService: {
      findById: mocks.findWorkspaceById,
    },
  }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    findWorkspaceEvent: mocks.findWorkspaceEvent,
    updateCapiStatus: mocks.updateCapiStatus,
  },
}))

vi.mock("@chatbotx.io/integration-meta-conversions", () => ({
  buildDatasetName: (name: string) =>
    name.trim() ? `${name.trim()} Event Data` : "Event Data",
  ensureDataset: mocks.metaEnsureDataset,
  sendConversionEvent: mocks.metaSendConversionEvent,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/conversions", () => ({
  ensureDataset: mocks.ensureDataset,
  sendConversionEvent: mocks.sendConversionEvent,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  debugToken: vi.fn(),
  hasPageEventsScope: vi.fn(),
  toAppAccessToken: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  debugToken: vi.fn(),
  hasInstagramManageEventsScope: vi.fn(),
  toAppAccessToken: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  debugTokenOrThrow: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return {
    ...actual,
    defaultQueue: { add: mocks.defaultQueueAdd },
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handleSendConversionEvent } = await import(
  "../src/integration/handlers/ads-conversion/send-conversion-event"
)
const { logger } = await import("../src/lib/logger")

const jobData = {
  adsConversionEventId: "ace-1",
  workspaceId: "ws-1",
}

const pendingEvent = {
  id: "ace-1",
  workspaceId: "ws-1",
  integrationWhatsappId: "iw-1",
  wabaId: "waba-1",
  eventType: "purchase" as const,
  occurredAt: new Date("2026-08-10T10:00:00.000Z"),
  sourceEventId: "source-1",
  ctwaClid: "clid-1",
  currency: "USD",
  value: "12.34",
  capiStatus: "pending" as const,
}

const integration = {
  id: "iw-1",
  workspaceId: "ws-1",
  wabaId: "waba-1",
  hasCapiScope: true,
  auth: {
    version: "v23.0",
    tokens: { accessToken: "token-1" },
    metadata: { wabaId: "waba-1" },
  },
}

describe("handleSendConversionEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWorkspaceEvent.mockResolvedValue(pendingEvent)
    mocks.findWorkspaceIntegration.mockResolvedValue(integration)
    mocks.ensureDatasetId.mockResolvedValue("dataset-1")
    mocks.sendConversionEvent.mockResolvedValue(undefined)
    mocks.updateCapiStatus.mockResolvedValue({ id: "ace-1" })
    mocks.findWorkspaceById.mockResolvedValue({
      id: "ws-1",
      capiLimitedDataUse: false,
    })
  })

  test("sends a pending event and marks it sent", async () => {
    await handleSendConversionEvent(jobData)

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.ensureDatasetId).toHaveBeenCalledWith({
      id: "iw-1",
      workspaceId: "ws-1",
      provision: expect.any(Function),
    })
    expect(mocks.sendConversionEvent).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v23.0",
      event: {
        eventType: "purchase",
        occurredAt: pendingEvent.occurredAt,
        sourceEventId: "source-1",
        ctwaClid: "clid-1",
        wabaId: "waba-1",
        currency: "USD",
        value: "12.34",
        userData: undefined,
        limitedDataUse: false,
        orderId: undefined,
        contents: undefined,
      },
    })
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "sent",
      capiSentAt: expect.any(Date),
    })
  })

  test("threads limitedDataUse: true from the workspace onto the whatsapp conversion event payload", async () => {
    mocks.findWorkspaceById.mockResolvedValue({
      id: "ws-1",
      capiLimitedDataUse: true,
    })

    await handleSendConversionEvent(jobData)

    expect(mocks.sendConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ limitedDataUse: true }),
      }),
    )
  })

  test("a workspace read failure propagates (throws) instead of sending with the wrong LDU state", async () => {
    mocks.findWorkspaceById.mockRejectedValue(
      new Error("workspace read failed"),
    )

    await expect(handleSendConversionEvent(jobData)).rejects.toThrow(
      "workspace read failed",
    )

    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed" }),
    )
  })

  test("creates the dataset with the token chosen by ensureDatasetId", async () => {
    // `ensureDatasetId` owns token selection (system-user token + fallback); the
    // handler's provision callback just performs the create with the given token.
    mocks.ensureDatasetId.mockImplementation(
      async (input: {
        provision: (params: {
          wabaId: string
          wabaName: string
          accessToken: string
        }) => Promise<string>
      }) =>
        await input.provision({
          wabaId: "waba-1",
          wabaName: "Shop Tran",
          accessToken: "wa-system-token",
        }),
    )
    mocks.ensureDataset.mockResolvedValue("dataset-1")

    await handleSendConversionEvent(jobData)

    expect(mocks.ensureDataset).toHaveBeenCalledWith({
      wabaId: "waba-1",
      accessToken: "wa-system-token",
      datasetName: "Shop Tran Event Data",
      version: "v23.0",
    })
  })

  test("skips when the integration lacks CAPI scope", async () => {
    mocks.findWorkspaceIntegration.mockResolvedValue({
      ...integration,
      hasCapiScope: false,
    })

    await handleSendConversionEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "skipped_no_scope",
    })
    expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("marks terminal failures failed and logs them", async () => {
    mocks.sendConversionEvent.mockRejectedValue(new Error("invalid token"))

    await handleSendConversionEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith("sendErrorLog", {
      type: "sendErrorLog",
      data: {
        workspaceId: "ws-1",
        error: {
          message: "invalid token",
          stack: expect.any(String),
          httpCode: "400",
        },
      },
    })
  })

  test("Codex #7 regression: the terminal-failure log NEVER serializes the raw error object (only a sanitized message+code record)", async () => {
    // A realistic Graph/WhatsApp HTTP error whose `origin` carries the
    // outgoing request — including an Authorization header for a manual CAPI
    // token — plus, for good measure, a `contact` property, simulating the
    // worst case where a raw error accidentally captured PII. None of this
    // may reach `logger.warn`.
    const dangerousError = Object.assign(new Error("Graph API rejected"), {
      code: "OAuthException",
      origin: {
        request: {
          headers: {
            Authorization: "Bearer super-secret-manual-capi-token",
          },
        },
      },
      contact: { email: "user@example.com", phoneNumber: "+15551234567" },
    })
    mocks.sendConversionEvent.mockRejectedValue(dangerousError)

    await handleSendConversionEvent(jobData)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        adsConversionEventId: "ace-1",
        workspaceId: "ws-1",
        err: { message: "Graph API rejected", code: "OAuthException" },
      }),
      "Ads conversion event marked failed",
    )

    // Belt-and-suspenders: serialize every actual logger.warn call and
    // confirm none of the sensitive substrings ever appear.
    const serializedCalls = JSON.stringify(
      (logger.warn as ReturnType<typeof vi.fn>).mock.calls,
    )
    expect(serializedCalls).not.toContain("super-secret-manual-capi-token")
    expect(serializedCalls).not.toContain("Authorization")
    expect(serializedCalls).not.toContain("user@example.com")
    expect(serializedCalls).not.toContain("+15551234567")
    expect(serializedCalls).not.toContain("origin")
  })

  test("throws retryable failures so BullMQ retries", async () => {
    const retryableError = Object.assign(new Error("rate limited"), {
      retryable: true,
    })
    mocks.sendConversionEvent.mockRejectedValue(retryableError)

    await expect(handleSendConversionEvent(jobData)).rejects.toThrow(
      "rate limited",
    )

    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed" }),
    )
  })

  test("marks failed when dataset provisioning fails terminally", async () => {
    mocks.ensureDatasetId.mockRejectedValue(new Error("dataset forbidden"))

    await handleSendConversionEvent(jobData)

    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })

  test("rethrows retryable dataset provisioning errors for retry", async () => {
    const retryableError = Object.assign(new Error("dataset rate limited"), {
      retryable: true,
    })
    mocks.ensureDatasetId.mockRejectedValue(retryableError)

    await expect(handleSendConversionEvent(jobData)).rejects.toThrow(
      "dataset rate limited",
    )
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed" }),
    )
  })

  test("completes when the conditional sent update loses", async () => {
    mocks.updateCapiStatus.mockResolvedValue(null)

    await expect(handleSendConversionEvent(jobData)).resolves.toBeUndefined()
  })

  test("whatsapp: enriches with hashed customer-info when contactInboxId resolves to a valid, in-workspace/in-inbox contact", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...pendingEvent,
      contactInboxId: "ci-wa-1",
    })
    mocks.findWorkspaceIntegration.mockResolvedValue({
      ...integration,
      inboxId: "inbox-wa-1",
    })
    mocks.findContactInbox.mockResolvedValue({
      id: "ci-wa-1",
      contactId: "contact-1",
      inboxId: "inbox-wa-1",
    })
    mocks.findContactByIdForWorkspace.mockResolvedValue({
      id: "contact-1",
      email: "john_smith@gmail.com",
    })

    await handleSendConversionEvent(jobData)

    expect(mocks.findContactInbox).toHaveBeenCalledWith({
      where: { id: "ci-wa-1" },
    })
    expect(mocks.findContactByIdForWorkspace).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
    expect(mocks.sendConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          userData: {
            em: [
              "62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f",
            ],
            external_id: [
              "35cbf2467d4fcab72620da43ded47984b0b3edfca1fa34c3fe43dd4917165d8a",
            ],
          },
        }),
      }),
    )
  })

  test("whatsapp: omits userData when the event has no contactInboxId (core send is unaffected)", async () => {
    await handleSendConversionEvent(jobData)

    expect(mocks.findContactInbox).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ userData: undefined }),
      }),
    )
  })

  test("whatsapp: omits userData when the contact inbox belongs to a different inbox than the resolved integration (never leaks foreign-tenant PII)", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...pendingEvent,
      contactInboxId: "ci-wa-1",
    })
    mocks.findWorkspaceIntegration.mockResolvedValue({
      ...integration,
      inboxId: "inbox-wa-1",
    })
    mocks.findContactInbox.mockResolvedValue({
      id: "ci-wa-1",
      contactId: "contact-1",
      inboxId: "inbox-other",
    })
    mocks.findContactByIdForWorkspace.mockResolvedValue({
      id: "contact-1",
      email: "john_smith@gmail.com",
    })

    await handleSendConversionEvent(jobData)

    // The core send still succeeds — only the optional enrichment is
    // skipped (Phase 0 protects PII, never blocks an already-valid send).
    expect(mocks.sendConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ userData: undefined }),
      }),
    )
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sent" }),
    )
  })

  test("missing event is a no-op", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(null)

    await handleSendConversionEvent(jobData)

    expect(mocks.findWorkspaceIntegration).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("non-pending event is a no-op", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...pendingEvent,
      capiStatus: "sent",
    })

    await handleSendConversionEvent(jobData)

    expect(mocks.findWorkspaceIntegration).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })
})

describe("handleSendConversionEvent — messenger/instagram (Phase 3)", () => {
  const messengerEvent = {
    id: "ace-2",
    workspaceId: "ws-1",
    channel: "messenger" as const,
    integrationMessengerId: "im-1",
    integrationInstagramId: null,
    eventType: "lead" as const,
    occurredAt: new Date("2026-08-10T10:00:00.000Z"),
    sourceEventId: "source-2",
    contactInboxId: "ci-1",
    currency: null,
    value: null,
    capiStatus: "pending" as const,
  }

  const instagramEvent = {
    ...messengerEvent,
    id: "ace-3",
    channel: "instagram" as const,
    integrationMessengerId: null,
    integrationInstagramId: "ii-1",
    sourceEventId: "source-3",
  }

  const messengerIntegration = {
    id: "im-1",
    workspaceId: "ws-1",
    inboxId: "inbox-1",
    pageId: "page-1",
    hasCapiScope: true,
    datasetId: "meta-dataset-1",
  }

  const instagramIntegration = {
    id: "ii-1",
    workspaceId: "ws-1",
    inboxId: "inbox-1",
    igId: "ig-1",
    hasCapiScope: true,
    datasetId: "meta-dataset-1",
  }

  const contactInbox = {
    id: "ci-1",
    sourceId: "psid-1",
    contactId: "contact-1",
    inboxId: "inbox-1",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMessengerIntegration.mockResolvedValue(messengerIntegration)
    mocks.findInstagramIntegration.mockResolvedValue(instagramIntegration)
    mocks.findContactInbox.mockResolvedValue(contactInbox)
    // Workspace-scoped: resolving a truthy row here is what asserts the
    // contact inbox's contact actually belongs to `event.workspaceId`.
    mocks.findContactByIdForWorkspace.mockResolvedValue({
      id: "contact-1",
      workspaceId: "ws-1",
    })
    mocks.resolveCapiAccessToken.mockResolvedValue({
      accessToken: "manual-token-1",
      source: "manual",
    })
    mocks.metaSendConversionEvent.mockResolvedValue(undefined)
    mocks.updateCapiStatus.mockResolvedValue({ id: "ace-2" })
    mocks.findWorkspaceById.mockResolvedValue({
      id: "ws-1",
      capiLimitedDataUse: false,
    })
  })

  // Deterministic — matches `hashContactUserData({ id: "contact-1" })`'s
  // external_id (SHA-256 of the opaque contact id, unnormalized). Computed
  // independently with `shasum -a 256`, not hand-guessed.
  const CONTACT_1_EXTERNAL_ID_HASH =
    "35cbf2467d4fcab72620da43ded47984b0b3edfca1fa34c3fe43dd4917165d8a"

  test("threads limitedDataUse: true from the workspace onto the messenger conversion event payload", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(messengerEvent)
    mocks.findWorkspaceById.mockResolvedValue({
      id: "ws-1",
      capiLimitedDataUse: true,
    })

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.metaSendConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ limitedDataUse: true }),
      }),
    )
  })

  test("a workspace read failure propagates (throws) instead of sending with the wrong LDU state", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(messengerEvent)
    mocks.findWorkspaceById.mockRejectedValue(
      new Error("workspace read failed"),
    )

    await expect(
      handleSendConversionEvent({
        adsConversionEventId: "ace-2",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("workspace read failed")

    expect(mocks.metaSendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed" }),
    )
  })

  test("sends a messenger conversion event using page identity + contact PSID", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(messengerEvent)

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.findMessengerIntegration).toHaveBeenCalledWith({
      id: "im-1",
      workspaceId: "ws-1",
    })
    expect(mocks.findContactInbox).toHaveBeenCalledWith({
      where: { id: "ci-1" },
    })
    expect(mocks.metaSendConversionEvent).toHaveBeenCalledWith({
      datasetId: "meta-dataset-1",
      accessToken: "manual-token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: messengerEvent.occurredAt,
        eventId: "source-2",
        currency: null,
        value: null,
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        userData: { external_id: [CONTACT_1_EXTERNAL_ID_HASH] },
        limitedDataUse: false,
        orderId: undefined,
        contents: undefined,
      },
    })
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-2",
      workspaceId: "ws-1",
      from: "pending",
      to: "sent",
      capiSentAt: expect.any(Date),
    })
  })

  test("sends an instagram Purchase conversion event using ig identity + contact IGSID", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...instagramEvent,
      eventType: "purchase" as const,
      currency: "USD",
      value: "9.99",
    })

    await handleSendConversionEvent({
      adsConversionEventId: "ace-3",
      workspaceId: "ws-1",
    })

    expect(mocks.findInstagramIntegration).toHaveBeenCalledWith({
      id: "ii-1",
      workspaceId: "ws-1",
    })
    expect(mocks.metaSendConversionEvent).toHaveBeenCalledWith({
      datasetId: "meta-dataset-1",
      accessToken: "manual-token-1",
      event: {
        eventName: "Purchase",
        occurredAt: instagramEvent.occurredAt,
        eventId: "source-3",
        currency: "USD",
        value: "9.99",
        messagingChannel: "instagram",
        instagramBusinessAccountId: "ig-1",
        igSid: "psid-1",
        userData: { external_id: [CONTACT_1_EXTERNAL_ID_HASH] },
        limitedDataUse: false,
        orderId: undefined,
        contents: undefined,
      },
    })
  })

  test("marks failed when the AdsConversionEvent has no contactInboxId", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...messengerEvent,
      contactInboxId: null,
    })

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.findContactInbox).not.toHaveBeenCalled()
    expect(mocks.metaSendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-2",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })

  test("marks failed when the contact inbox is not found", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(messengerEvent)
    mocks.findContactInbox.mockResolvedValue(undefined)

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.metaSendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-2",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })

  test("marks failed when the messenger integration id is missing", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...messengerEvent,
      integrationMessengerId: null,
    })

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.findMessengerIntegration).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-2",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })

  test("marks failed when the messenger integration is not found", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(messengerEvent)
    mocks.findMessengerIntegration.mockResolvedValue(null)

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.metaSendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-2",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })

  test("marks failed when the contact inbox's contact belongs to a different workspace", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(messengerEvent)
    // `contactInboxService.findByUncached` is looked up by id alone, with no
    // workspace scoping — simulate a foreign/stale contactInboxId by having
    // the workspace-scoped contact lookup come back empty.
    mocks.findContactByIdForWorkspace.mockResolvedValue(undefined)

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.findContactByIdForWorkspace).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
    expect(mocks.metaSendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-2",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })

  test("marks failed when the contact inbox belongs to a different inbox than the resolved integration", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(messengerEvent)
    // Same workspace, but the contact inbox's inbox does not match the
    // messenger integration's inbox — e.g. a contactInboxId that drifted to
    // a different page/integration within the same workspace.
    mocks.findContactInbox.mockResolvedValue({
      ...contactInbox,
      inboxId: "inbox-other",
    })

    await handleSendConversionEvent({
      adsConversionEventId: "ace-2",
      workspaceId: "ws-1",
    })

    expect(mocks.metaSendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-2",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })
})
