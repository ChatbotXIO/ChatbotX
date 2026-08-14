import { beforeEach, describe, expect, test, vi } from "vitest"

type DatasetProvisionInput = {
  accessToken: string
  resourceId: string
}

type MessengerIntegration = typeof integration

const mocks = vi.hoisted(() => ({
  findWorkspaceEvent: vi.fn(),
  updateCapiStatus: vi.fn(),
  findMessengerIntegration: vi.fn(),
  findInstagramIntegration: vi.fn(),
  findWhatsappIntegration: vi.fn(),
  refreshCapiScopeCache: vi.fn(),
  ensureDatasetId: vi.fn(),
  findContactInbox: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string | undefined, fn: () => Promise<void>) =>
      await fn(),
  ),
  ensureDataset: vi.fn(),
  sendConversionEvent: vi.fn(),
  resolveCapiAccessToken: vi.fn(),
  defaultQueueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    contactInboxService: {
      findByUncached: mocks.findContactInbox,
    },
    instagramIntegrationService: {
      findByIdForWorkspace: mocks.findInstagramIntegration,
    },
    messengerIntegrationService: {
      findByIdForWorkspace: mocks.findMessengerIntegration,
    },
    integrationWhatsappService: {
      findByIdForWorkspace: mocks.findWhatsappIntegration,
    },
    metaConversionsService: {
      findWorkspaceEvent: mocks.findWorkspaceEvent,
      updateCapiStatus: mocks.updateCapiStatus,
      refreshCapiScopeCache: mocks.refreshCapiScopeCache,
      ensureDatasetId: mocks.ensureDatasetId,
    },
    resolveCapiAccessToken: mocks.resolveCapiAccessToken,
    withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
  }
})

vi.mock("@chatbotx.io/integration-meta-conversions", () => ({
  ensureDataset: mocks.ensureDataset,
  sendConversionEvent: mocks.sendConversionEvent,
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

const { handleSendMetaCapiEvent } = await import(
  "../src/integration/handlers/meta-conversions/send-meta-capi-event"
)

const jobData = {
  metaCapiEventId: "mce-1",
  workspaceId: "ws-1",
}

const pendingEvent = {
  id: "mce-1",
  workspaceId: "ws-1",
  channel: "messenger" as const,
  integrationId: "im-1",
  contactInboxId: "ci-1",
  eventName: "LeadSubmitted" as const,
  occurredAt: new Date("2026-08-10T10:00:00.000Z"),
  source: "flowStep" as const,
  sourceKey: "flow:step-1:ci-1:20260810",
  capiStatus: "pending" as const,
}

const integration = {
  id: "im-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  pageId: "page-1",
  hasCapiScope: true,
  capiScopeCheckedAt: null,
  datasetId: null,
  auth: {
    tokens: { accessToken: "token-1" },
  },
}

const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  sourceId: "psid-1",
}

const whatsappIntegration = {
  id: "wa-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  wabaId: "waba-1",
  hasCapiScope: true,
  capiScopeCheckedAt: null,
  datasetId: null,
  auth: {
    tokens: { accessToken: "token-1" },
  },
}

const whatsappPendingEvent = {
  ...pendingEvent,
  channel: "whatsapp" as const,
  integrationId: "wa-1",
}

const whatsappContactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  sourceId: "wa-user-1",
  referral: { ctwaClid: "clid-1" },
}

describe("handleSendMetaCapiEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWorkspaceEvent.mockResolvedValue(pendingEvent)
    mocks.findMessengerIntegration.mockResolvedValue(integration)
    mocks.findInstagramIntegration.mockResolvedValue(undefined)
    mocks.findWhatsappIntegration.mockResolvedValue(undefined)
    mocks.refreshCapiScopeCache.mockImplementation(
      async (input: { integration: MessengerIntegration }) => input.integration,
    )
    mocks.findContactInbox.mockResolvedValue(contactInbox)
    mocks.ensureDataset.mockResolvedValue("dataset-1")
    mocks.resolveCapiAccessToken.mockResolvedValue({
      accessToken: "token-1",
      source: "oauth",
    })
    mocks.ensureDatasetId.mockImplementation(
      async (input: {
        provisionDataset: (data: DatasetProvisionInput) => Promise<string>
      }) =>
        await input.provisionDataset({
          accessToken: "token-1",
          resourceId: "page-1",
        }),
    )
    mocks.sendConversionEvent.mockResolvedValue(undefined)
    mocks.updateCapiStatus.mockResolvedValue({ id: "mce-1" })
  })

  test("sends a pending event and marks it sent", async () => {
    await handleSendMetaCapiEvent(jobData)

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.findMessengerIntegration).toHaveBeenCalledWith({
      id: "im-1",
      workspaceId: "ws-1",
    })
    expect(mocks.refreshCapiScopeCache).toHaveBeenCalledWith({
      channel: "messenger",
      integration,
      checkScope: expect.any(Function),
    })
    expect(mocks.ensureDataset).toHaveBeenCalledWith({
      resourceType: "page",
      resourceId: "page-1",
      accessToken: "token-1",
    })
    expect(mocks.sendConversionEvent).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: pendingEvent.occurredAt,
        eventId: "flow:step-1:ci-1:20260810",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
      },
    })
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "sent",
      capiSentAt: expect.any(Date),
    })
  })

  test("sends a manual-token event with a stored dataset without refreshing scope", async () => {
    mocks.findMessengerIntegration.mockResolvedValue({
      ...integration,
      datasetId: "dataset-manual",
      capiAccessToken: { encrypted: true },
      hasCapiScope: false,
    })
    mocks.resolveCapiAccessToken.mockResolvedValue({
      accessToken: "manual-token-1",
      source: "manual",
    })

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
    expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
    expect(mocks.ensureDataset).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).toHaveBeenCalledWith({
      datasetId: "dataset-manual",
      accessToken: "manual-token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: pendingEvent.occurredAt,
        eventId: "flow:step-1:ci-1:20260810",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
      },
    })
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "sent",
      capiSentAt: expect.any(Date),
    })
  })

  test("skips a manual-token event without a stored dataset", async () => {
    mocks.resolveCapiAccessToken.mockResolvedValue({
      accessToken: "manual-token-1",
      source: "manual",
    })

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "skipped_no_scope",
    })
    // A manual token skips the OAuth scope refresh entirely; the contact
    // identity is resolved up front (shared with the WhatsApp identity gate)
    // but no dataset is provisioned and nothing is sent.
    expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
    expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("forwards value and currency to the conversion event payload", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...pendingEvent,
      value: "10.5",
      currency: "USD",
    })

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.sendConversionEvent).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: pendingEvent.occurredAt,
        eventId: "flow:step-1:ci-1:20260810",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        value: "10.5",
        currency: "USD",
      },
    })
  })

  test("skips when the integration lacks CAPI scope", async () => {
    mocks.refreshCapiScopeCache.mockResolvedValue({
      ...integration,
      hasCapiScope: false,
    })

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "skipped_no_scope",
    })
    expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("rethrows scope-check refresh failures without marking skipped_no_scope", async () => {
    const refreshError = Object.assign(new Error("debug_token unavailable"), {
      retryable: true,
    })
    mocks.refreshCapiScopeCache.mockRejectedValue(refreshError)

    await expect(handleSendMetaCapiEvent(jobData)).rejects.toThrow(
      "debug_token unavailable",
    )

    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mce-1",
        workspaceId: "ws-1",
        to: "skipped_no_scope",
      }),
    )
    expect(mocks.updateCapiStatus).not.toHaveBeenCalled()
    expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("marks terminal failures failed and logs them", async () => {
    mocks.sendConversionEvent.mockRejectedValue(new Error("invalid token"))

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
      capiError: "invalid token",
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

  test("throws retryable failures so BullMQ retries", async () => {
    const retryableError = Object.assign(new Error("rate limited"), {
      retryable: true,
    })
    mocks.sendConversionEvent.mockRejectedValue(retryableError)

    await expect(handleSendMetaCapiEvent(jobData)).rejects.toThrow(
      "rate limited",
    )

    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed" }),
    )
  })

  test("non-pending event is a no-op", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...pendingEvent,
      capiStatus: "sent",
    })

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.findMessengerIntegration).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("user-disconnected integration skips the event without sending", async () => {
    mocks.findMessengerIntegration.mockResolvedValue({
      ...integration,
      capiDisconnectedAt: new Date("2026-08-13T00:00:00Z"),
    })

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "skipped_disconnected",
    })
    expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("missing integration marks the event failed without sending", async () => {
    mocks.findMessengerIntegration.mockResolvedValue(undefined)

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
      capiError: "integrationNotFound",
    })
    expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.defaultQueueAdd).not.toHaveBeenCalled()
  })

  test("missing contact inbox marks the event failed without sending", async () => {
    mocks.findContactInbox.mockResolvedValue(null)

    await handleSendMetaCapiEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "mce-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
      capiError: "contactInboxNotFound",
    })
    expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.defaultQueueAdd).not.toHaveBeenCalled()
  })

  describe("whatsapp channel", () => {
    beforeEach(() => {
      mocks.findWorkspaceEvent.mockResolvedValue(whatsappPendingEvent)
      mocks.findWhatsappIntegration.mockResolvedValue(whatsappIntegration)
      mocks.findContactInbox.mockResolvedValue(whatsappContactInbox)
      mocks.refreshCapiScopeCache.mockImplementation(
        async (input: { integration: typeof whatsappIntegration }) =>
          input.integration,
      )
      mocks.ensureDatasetId.mockImplementation(
        async (input: {
          provisionDataset: (data: DatasetProvisionInput) => Promise<string>
        }) =>
          await input.provisionDataset({
            accessToken: "token-1",
            resourceId: "waba-1",
          }),
      )
    })

    test("sends a pending whatsapp event with a ctwa_clid and marks it sent", async () => {
      await handleSendMetaCapiEvent(jobData)

      expect(mocks.findWhatsappIntegration).toHaveBeenCalledWith({
        id: "wa-1",
        workspaceId: "ws-1",
      })
      expect(mocks.ensureDataset).toHaveBeenCalledWith({
        resourceType: "waba",
        resourceId: "waba-1",
        accessToken: "token-1",
      })
      expect(mocks.sendConversionEvent).toHaveBeenCalledWith({
        datasetId: "dataset-1",
        accessToken: "token-1",
        event: {
          eventName: "LeadSubmitted",
          occurredAt: whatsappPendingEvent.occurredAt,
          eventId: "flow:step-1:ci-1:20260810",
          messagingChannel: "whatsapp",
          wabaId: "waba-1",
          ctwaClid: "clid-1",
        },
      })
      expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
        id: "mce-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "sent",
        capiSentAt: expect.any(Date),
      })
    })

    test("skips a whatsapp event whose contact has no ctwa_clid", async () => {
      mocks.findContactInbox.mockResolvedValue({
        ...whatsappContactInbox,
        referral: null,
      })

      await handleSendMetaCapiEvent(jobData)

      expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
        id: "mce-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "skipped_no_identity",
      })
      expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
      expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    })

    test("no ctwa_clid wins over missing scope: skipped_no_identity before any scope work", async () => {
      // A whatsapp contact with neither a ctwa_clid nor CAPI scope must be
      // terminally skipped_no_identity (the harder, unsendable constraint), and
      // the handler must NOT spend a debug-token scope refresh on an event it
      // can never send — so refreshCapiScopeCache is never reached.
      mocks.findContactInbox.mockResolvedValue({
        ...whatsappContactInbox,
        referral: null,
      })
      mocks.refreshCapiScopeCache.mockResolvedValue({
        ...whatsappIntegration,
        hasCapiScope: false,
      })

      await handleSendMetaCapiEvent(jobData)

      expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
        id: "mce-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "skipped_no_identity",
      })
      expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
      expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
      expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    })

    test("skips a whatsapp event when the integration lacks CAPI scope", async () => {
      mocks.refreshCapiScopeCache.mockResolvedValue({
        ...whatsappIntegration,
        hasCapiScope: false,
      })

      await handleSendMetaCapiEvent(jobData)

      expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
        id: "mce-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "skipped_no_scope",
      })
      expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
      expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    })

    test("a whatsapp integration without a disconnect flag still sends", async () => {
      // Happy path sanity check now that whatsapp rows carry
      // `capiDisconnectedAt` (v1.7): unset must not skip the send.
      await handleSendMetaCapiEvent(jobData)

      expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
        expect.objectContaining({ to: "skipped_disconnected" }),
      )
      expect(mocks.sendConversionEvent).toHaveBeenCalled()
    })

    test("a user-disconnected whatsapp integration skips the event without sending", async () => {
      // v1.7 — WhatsApp is now a full CAPI connect peer of messenger/
      // instagram: a user Disconnect on the WhatsApp CAPI tab must gate the
      // send the same way it does for messenger/instagram.
      mocks.findWhatsappIntegration.mockResolvedValue({
        ...whatsappIntegration,
        capiDisconnectedAt: new Date("2026-08-14T00:00:00.000Z"),
      })

      await handleSendMetaCapiEvent(jobData)

      expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
        id: "mce-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "skipped_disconnected",
      })
      expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
      expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    })

    test("sends a manual-token whatsapp event with a stored dataset without refreshing scope", async () => {
      mocks.findWhatsappIntegration.mockResolvedValue({
        ...whatsappIntegration,
        datasetId: "dataset-manual",
        capiAccessToken: { encrypted: true },
        hasCapiScope: false,
      })
      mocks.resolveCapiAccessToken.mockResolvedValue({
        accessToken: "manual-token-1",
        source: "manual",
      })

      await handleSendMetaCapiEvent(jobData)

      expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
      expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
      expect(mocks.ensureDataset).not.toHaveBeenCalled()
      expect(mocks.sendConversionEvent).toHaveBeenCalledWith({
        datasetId: "dataset-manual",
        accessToken: "manual-token-1",
        event: {
          eventName: "LeadSubmitted",
          occurredAt: whatsappPendingEvent.occurredAt,
          eventId: "flow:step-1:ci-1:20260810",
          messagingChannel: "whatsapp",
          wabaId: "waba-1",
          ctwaClid: "clid-1",
        },
      })
      expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
        id: "mce-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "sent",
        capiSentAt: expect.any(Date),
      })
    })

    test("skips a manual-token whatsapp event without a stored dataset", async () => {
      mocks.resolveCapiAccessToken.mockResolvedValue({
        accessToken: "manual-token-1",
        source: "manual",
      })

      await handleSendMetaCapiEvent(jobData)

      expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
        id: "mce-1",
        workspaceId: "ws-1",
        from: "pending",
        to: "skipped_no_scope",
      })
      expect(mocks.refreshCapiScopeCache).not.toHaveBeenCalled()
      expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
      expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    })
  })
})
