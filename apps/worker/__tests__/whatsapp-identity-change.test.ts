import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockChangePrimaryPhone,
  mockAdoptPhoneNumberIfSafe,
  mockIdentifyIntegration,
  mockLogger,
  mockRotateScopedUserId,
} = vi.hoisted(() => ({
  mockChangePrimaryPhone: vi.fn(),
  mockAdoptPhoneNumberIfSafe: vi.fn(),
  mockIdentifyIntegration: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockRotateScopedUserId: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    changePrimaryPhone: mockChangePrimaryPhone,
    rotateScopedUserId: mockRotateScopedUserId,
  },
  contactService: { adoptPhoneNumberIfSafe: mockAdoptPhoneNumberIfSafe },
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mockIdentifyIntegration,
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: mockLogger }))

const { handleWhatsappIdentityChange } = await import(
  "../src/integration/handlers/whatsapp-identity-change"
)

const baseContactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
  sourceId: "84900000001",
  sourceUserId: "bsuid-1",
  sourceParentUserId: null,
  contact: {
    id: "contact-1",
    phoneNumber: "+84900000001",
    workspaceId: "workspace-1",
  },
}

const jobData = (
  change:
    | {
        kind: "userIdChanged"
        previousUserId?: string
        userId: string
        previousPhone?: string
        newPhone?: string
      }
    | {
        kind: "phoneChanged"
        previousPhone: string
        newPhone: string
        userId?: string
      },
) => ({
  integrationType: "whatsapp" as const,
  integrationIdentifier: "phone-1",
  payload: {
    phoneNumberId: "phone-1",
    messageId: "wamid.1",
    change,
  },
})

describe("handleWhatsappIdentityChange", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIdentifyIntegration.mockResolvedValue({
      inbox: { id: "inbox-1", workspaceId: "workspace-1" },
    })
    mockAdoptPhoneNumberIfSafe.mockResolvedValue({})
  })

  test("routes userIdChanged to the scoped-user-id service", async () => {
    mockRotateScopedUserId.mockResolvedValue({
      status: "applied",
      contactInbox: baseContactInbox,
    })
    await handleWhatsappIdentityChange(
      jobData({
        kind: "userIdChanged",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    )
    expect(mockRotateScopedUserId).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      previousUserId: "bsuid-old",
      userId: "bsuid-new",
      previousParentUserId: undefined,
      parentUserId: undefined,
      previousPhone: undefined,
      newPhone: undefined,
    })
  })

  test("does not adopt a phone for a hidden-phone userIdChanged event", async () => {
    mockRotateScopedUserId.mockResolvedValue({
      status: "applied",
      contactInbox: {
        ...baseContactInbox,
        sourceId: "bsuid-new",
        sourceUserId: "bsuid-new",
      },
    })

    await handleWhatsappIdentityChange(
      jobData({
        kind: "userIdChanged",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
      }),
    )

    expect(mockRotateScopedUserId).toHaveBeenCalledWith(
      expect.objectContaining({
        previousPhone: undefined,
        newPhone: undefined,
      }),
    )
    expect(mockAdoptPhoneNumberIfSafe).not.toHaveBeenCalled()
  })

  test("adopts the phone from userIdChanged through the shared phone step", async () => {
    mockRotateScopedUserId.mockResolvedValue({
      status: "applied",
      contactInbox: baseContactInbox,
      phoneTransition: {
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
    })

    await handleWhatsappIdentityChange(
      jobData({
        kind: "userIdChanged",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    )

    expect(mockRotateScopedUserId).toHaveBeenCalledWith(
      expect.objectContaining({
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    )
    expect(mockAdoptPhoneNumberIfSafe).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })
  })

  test("does not adopt an unreported phone transition", async () => {
    mockRotateScopedUserId.mockResolvedValue({
      status: "applied",
      contactInbox: baseContactInbox,
    })

    await handleWhatsappIdentityChange(
      jobData({
        kind: "userIdChanged",
        previousUserId: "bsuid-old",
        userId: "bsuid-new",
        previousPhone: "84900000001",
        newPhone: "bsuid-new",
      }),
    )

    expect(mockAdoptPhoneNumberIfSafe).not.toHaveBeenCalled()
  })

  test("completes a userIdChanged conflict without adopting the new phone", async () => {
    mockRotateScopedUserId.mockResolvedValue({
      status: "conflict",
      contactInbox: baseContactInbox,
      constraint: "ContactInbox_inboxId_sourceId_key",
    })

    await expect(
      handleWhatsappIdentityChange(
        jobData({
          kind: "userIdChanged",
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
          previousPhone: "84900000001",
          newPhone: "84900000002",
        }),
      ),
    ).resolves.toBeUndefined()

    expect(mockAdoptPhoneNumberIfSafe).not.toHaveBeenCalled()
  })

  test("routes phoneChanged to the primary-phone service", async () => {
    mockChangePrimaryPhone.mockResolvedValue({ status: "notFound" })

    await handleWhatsappIdentityChange(
      jobData({
        kind: "phoneChanged",
        previousPhone: "84900000001",
        newPhone: "84900000002",
        userId: "bsuid-1",
      }),
    )

    expect(mockChangePrimaryPhone).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      previousPhone: "84900000001",
      newPhone: "84900000002",
      userId: "bsuid-1",
    })
  })

  test.each([
    { stored: null },
    { stored: "" },
    { stored: "+84900000001" },
    { stored: "84900000001" },
  ])("adopts the new phone when the stored phone is $stored", async ({
    stored,
  }) => {
    mockChangePrimaryPhone.mockResolvedValue({
      status: "applied",
      phoneTransition: {
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
      contactInbox: {
        ...baseContactInbox,
        contact: { ...baseContactInbox.contact, phoneNumber: stored },
      },
    })
    await handleWhatsappIdentityChange(
      jobData({
        kind: "phoneChanged",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    )
    expect(mockAdoptPhoneNumberIfSafe).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })
  })

  test("delegates eligibility checks to the atomic business method", async () => {
    mockChangePrimaryPhone.mockResolvedValue({
      status: "applied",
      phoneTransition: {
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
      contactInbox: {
        ...baseContactInbox,
        contact: { ...baseContactInbox.contact, phoneNumber: "+84888888888" },
      },
    })
    await handleWhatsappIdentityChange(
      jobData({
        kind: "phoneChanged",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    )
    expect(mockAdoptPhoneNumberIfSafe).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })
  })

  test("adopts the new phone when a retry finds the identity change already applied", async () => {
    mockChangePrimaryPhone.mockResolvedValue({
      status: "alreadyApplied",
      contactInbox: baseContactInbox,
      phoneTransition: {
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
    })

    await handleWhatsappIdentityChange(
      jobData({
        kind: "phoneChanged",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    )

    expect(mockAdoptPhoneNumberIfSafe).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })
  })

  test("logs an atomic concurrent-change skip at info level", async () => {
    mockChangePrimaryPhone.mockResolvedValue({
      status: "applied",
      contactInbox: baseContactInbox,
      phoneTransition: {
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
    })
    mockAdoptPhoneNumberIfSafe.mockResolvedValue(undefined)

    await handleWhatsappIdentityChange(
      jobData({
        kind: "phoneChanged",
        previousPhone: "84900000001",
        newPhone: "84900000002",
      }),
    )

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "contact-1" }),
      expect.stringContaining("phone number adoption skipped"),
    )
  })

  test("logs and swallows Contact.phoneNumber update failures", async () => {
    const err = new Error("contact update failed")
    mockChangePrimaryPhone.mockResolvedValue({
      status: "applied",
      contactInbox: baseContactInbox,
      phoneTransition: {
        previousPhone: "84900000001",
        newPhone: "84900000002",
      },
    })
    mockAdoptPhoneNumberIfSafe.mockRejectedValue(err)
    await expect(
      handleWhatsappIdentityChange(
        jobData({
          kind: "phoneChanged",
          previousPhone: "84900000001",
          newPhone: "84900000002",
        }),
      ),
    ).resolves.toBeUndefined()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      expect.stringContaining("phone number update failed"),
    )
  })

  test.each([
    "notFound",
    "conflict",
    "stale",
  ] as const)("%s completes without creating or updating a contact", async (status) => {
    mockChangePrimaryPhone.mockResolvedValue({ status })
    await expect(
      handleWhatsappIdentityChange(
        jobData({
          kind: "phoneChanged",
          previousPhone: "84900000001",
          newPhone: "84900000002",
        }),
      ),
    ).resolves.toBeUndefined()
    expect(mockAdoptPhoneNumberIfSafe).not.toHaveBeenCalled()
  })

  test("invalid completes the job and logs a warning", async () => {
    mockChangePrimaryPhone.mockResolvedValue({ status: "invalid" })

    await expect(
      handleWhatsappIdentityChange(
        jobData({
          kind: "phoneChanged",
          previousPhone: "84900000001",
          newPhone: "84900000002",
        }),
      ),
    ).resolves.toBeUndefined()

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        changeKind: "phoneChanged",
        messageId: "wamid.1",
      }),
      expect.stringContaining("invalid"),
    )
    expect(mockAdoptPhoneNumberIfSafe).not.toHaveBeenCalled()
  })

  test("unexpected service errors rethrow for BullMQ retry", async () => {
    const err = new Error("database unavailable")
    mockRotateScopedUserId.mockRejectedValue(err)
    await expect(
      handleWhatsappIdentityChange(
        jobData({
          kind: "userIdChanged",
          previousUserId: "bsuid-old",
          userId: "bsuid-new",
        }),
      ),
    ).rejects.toBe(err)
  })
})
