import { createHmac } from "node:crypto"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConversationFindBy,
  mockFindDMByContact,
  mockFindMemberWithUserByWorkspaceIdAndUserId,
  mockFindRecentByContactId,
  mockFindWithIntegrationsById,
  mockMessageFindById,
  mockResolveWorkspaceAppUrl,
  mockResolveTenantSettings,
  mockSystemFieldCreate,
  mockResolveGenderLabel,
  mockSignMeLink,
  mockMessengerGetUserInboxLink,
  mockMessengerGetPostDetails,
  mockAppointmentFindBy,
  testEncryptionKey,
} = vi.hoisted(() => ({
  mockConversationFindBy: vi.fn().mockResolvedValue({
    assignedUserId: "user-1",
  }),
  mockFindDMByContact: vi.fn(),
  mockFindMemberWithUserByWorkspaceIdAndUserId: vi.fn().mockResolvedValue({
    userId: "user-1",
    user: { id: "user-1", name: "Admin", email: "admin@example.com" },
  }),
  mockFindRecentByContactId: vi.fn(),
  mockFindWithIntegrationsById: vi.fn(),
  mockMessageFindById: vi.fn(),
  mockResolveWorkspaceAppUrl: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
  mockSystemFieldCreate: vi.fn(),
  mockResolveGenderLabel: vi.fn(),
  mockSignMeLink: vi.fn(),
  mockMessengerGetUserInboxLink: vi.fn(),
  mockMessengerGetPostDetails: vi.fn(),
  mockAppointmentFindBy: vi.fn(),
  testEncryptionKey:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    findBy: mockAppointmentFindBy,
  },
  contactInboxService: {
    findRecentByContactId: mockFindRecentByContactId,
  },
  conversationService: {
    findBy: mockConversationFindBy,
    findDMByContact: mockFindDMByContact,
  },
  inboxService: {
    findWithIntegrationsById: mockFindWithIntegrationsById,
  },
  messageService: {
    findById: mockMessageFindById,
  },
  resolveWorkspaceAppUrl: mockResolveWorkspaceAppUrl,
  resolveTenantSettings: mockResolveTenantSettings,
  workspaceMemberService: {
    findWithUserByWorkspaceIdAndUserId:
      mockFindMemberWithUserByWorkspaceIdAndUserId,
  },
}))

vi.mock("@chatbotx.io/encryption/keys", () => ({
  env: {
    ENCRYPTION_KEY: testEncryptionKey,
  },
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  systemFieldService: {
    create: mockSystemFieldCreate,
  },
  resolveGenderLabel: mockResolveGenderLabel,
}))

vi.mock("@chatbotx.io/encryption/link-signature", () => ({
  signMeLink: mockSignMeLink,
}))

const cache = new Map<string, unknown>()
vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (key: string, resolve: () => Promise<unknown>) => {
    if (cache.has(key)) {
      return cache.get(key)
    }
    const value = await resolve()
    cache.set(key, value)
    return value
  }),
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  fetchInstagramContactProfile: vi.fn(),
  getPostDetails: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  getUserInboxLink: mockMessengerGetUserInboxLink,
  getPostDetails: mockMessengerGetPostDetails,
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
  toPublicStorageUrl: (path: string | null | undefined, baseUrl: string) => {
    if (!path) {
      return null
    }
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path
    }
    return new URL(path, baseUrl).toString()
  },
}))

const { getSystemFieldValue } = await import("../src/utils")

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  timezone: "UTC",
} as ContactModel

const contactInbox = {
  id: "contact-inbox-1",
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  contactLastReadAt: new Date("2026-01-02T03:04:05.000Z"),
  lastIncomingMessageAt: new Date("2026-01-02T03:04:05.000Z"),
  channel: "messenger",
  inboxId: "inbox-1",
  source: "ads",
  sourceId: "source-1",
} as ContactInboxModel

const workspace = {
  id: "workspace-1",
  name: "Workspace One",
  logo: null,
  timezone: "UTC",
  token: "workspace-token",
} as WorkspaceModel

const conversation = {
  id: "conversation-1",
  contactId: "contact-1",
  workspaceId: "workspace-1",
} as ConversationModel

const createContext = (overrides?: {
  contact?: ContactModel
  contactInbox?: ContactInboxModel | null
  conversation?: ConversationModel | null
  appointmentId?: string
  workspace?: WorkspaceModel | null
}) => ({
  contact: overrides?.contact ?? contact,
  contactInbox:
    overrides && "contactInbox" in overrides
      ? overrides.contactInbox
      : contactInbox,
  conversation:
    overrides && "conversation" in overrides
      ? overrides.conversation
      : conversation,
  appointmentId: overrides?.appointmentId,
  workspace:
    overrides && "workspace" in overrides ? overrides.workspace : workspace,
})

describe("getSystemFieldValue", () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  test("user_hash uses ENCRYPTION_KEY with the contact inbox source id and id", async () => {
    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.user_hash),
    ).resolves.toBe(
      createHmac("sha256", Buffer.from(testEncryptionKey, "hex"))
        .update("source-1:contact-inbox-1")
        .digest("hex"),
    )
  })

  test("user_hash returns null without a contact inbox context", async () => {
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: null }),
        systemFieldTypes.enum.user_hash,
      ),
    ).resolves.toBeNull()
  })

  test("user_channel capitalizes the first letter", async () => {
    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.user_channel),
    ).resolves.toBe("Messenger")
  })

  test("user_channel capitalizes the fallback primary channel", async () => {
    mockFindRecentByContactId.mockResolvedValue({
      ...contactInbox,
      channel: "webchat",
    })

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: null }),
        systemFieldTypes.enum.user_channel,
      ),
    ).resolves.toBe("Webchat")
    expect(mockFindRecentByContactId).toHaveBeenCalledWith({
      contactId: "contact-1",
    })
  })

  test("ig_user_name resolves the Instagram contact username", async () => {
    const { fetchInstagramContactProfile } = await import(
      "@chatbotx.io/integration-instagram"
    )
    vi.mocked(fetchInstagramContactProfile).mockResolvedValue({
      username: "contact_username",
      followersCount: 123,
      followsBusiness: true,
      businessFollowUser: false,
      isVerified: true,
    })
    const instagramInbox = {
      ...contactInbox,
      channel: "instagram",
      sourceId: "igsid-1",
    } as ContactInboxModel
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationInstagram: {
        id: "instagram-integration-1",
        auth: {
          tokens: { accessToken: "page-token" },
          metadata: { version: "v23.0" },
        },
        username: "business_username",
      },
    })

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: instagramInbox }),
        systemFieldTypes.enum.ig_user_name,
      ),
    ).resolves.toBe("contact_username")
    expect(fetchInstagramContactProfile).toHaveBeenCalledWith({
      igsid: "igsid-1",
      accessToken: "page-token",
      version: "v23.0",
    })
  })

  // The four profile fields share one cached Graph API call, and the resolver
  // maps them via a fall-through `default:` — so each must be asserted against
  // a distinct value or a swapped mapping would go unnoticed.
  test("instagram profile fields each map to their own attribute", async () => {
    const { fetchInstagramContactProfile } = await import(
      "@chatbotx.io/integration-instagram"
    )
    vi.mocked(fetchInstagramContactProfile).mockResolvedValue({
      username: "contact_username",
      followersCount: 123,
      followsBusiness: true,
      businessFollowUser: false,
      isVerified: true,
    })
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationInstagram: {
        id: "instagram-integration-1",
        auth: { tokens: { accessToken: "page-token" } },
      },
    })
    const context = createContext({
      contactInbox: {
        ...contactInbox,
        channel: "instagram",
        sourceId: "igsid-1",
      } as ContactInboxModel,
    })

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.ig_followers),
    ).resolves.toBe("123")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.ig_verified),
    ).resolves.toBe("true")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.ig_follow_business),
    ).resolves.toBe("true")
    await expect(
      getSystemFieldValue(
        context,
        systemFieldTypes.enum.ig_business_follow_user,
      ),
    ).resolves.toBe("false")

    expect(fetchInstagramContactProfile).toHaveBeenCalledTimes(1)
  })

  test("instagram profile fields return null when the attribute is missing", async () => {
    const { fetchInstagramContactProfile } = await import(
      "@chatbotx.io/integration-instagram"
    )
    vi.mocked(fetchInstagramContactProfile).mockResolvedValue({
      username: null,
      followersCount: null,
      followsBusiness: null,
      businessFollowUser: null,
      isVerified: null,
    })
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationInstagram: {
        id: "instagram-integration-1",
        auth: { tokens: { accessToken: "page-token" } },
      },
    })
    const context = createContext({
      contactInbox: {
        ...contactInbox,
        channel: "instagram",
        sourceId: "igsid-1",
      } as ContactInboxModel,
    })

    for (const key of [
      systemFieldTypes.enum.ig_user_name,
      systemFieldTypes.enum.ig_followers,
      systemFieldTypes.enum.ig_verified,
      systemFieldTypes.enum.ig_follow_business,
      systemFieldTypes.enum.ig_business_follow_user,
    ]) {
      await expect(getSystemFieldValue(context, key)).resolves.toBeNull()
    }
  })

  test("instagram profile fields fall back to null without an access token", async () => {
    const { fetchInstagramContactProfile } = await import(
      "@chatbotx.io/integration-instagram"
    )
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationInstagram: { id: "instagram-integration-1", auth: {} },
    })

    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            channel: "instagram",
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.ig_followers,
      ),
    ).resolves.toBeNull()
    expect(fetchInstagramContactProfile).not.toHaveBeenCalled()
  })

  test("instagram profile fields return null when the inbox has no instagram integration", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})

    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.ig_verified),
    ).resolves.toBeNull()
  })

  test("fb_chat_link resolves the Business Suite conversation link", async () => {
    mockMessengerGetUserInboxLink.mockResolvedValue(
      "https://business.facebook.com/1453585961452628/inbox/1453594044785153",
    )
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationMessenger: {
        id: "messenger-integration-1",
        pageId: "12345",
        auth: { tokens: { accessToken: "token" }, version: "v23.0" },
      },
    })

    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.fb_chat_link),
    ).resolves.toBe(
      "https://business.facebook.com/1453585961452628/inbox/1453594044785153",
    )
    expect(mockMessengerGetUserInboxLink).toHaveBeenCalledWith({
      ctx: {
        auth: { tokens: { accessToken: "token" }, version: "v23.0" },
      },
      input: { userId: "source-1" },
    })
  })

  test("fb_chat_link returns null when the inbox has no messenger integration", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})

    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.fb_chat_link),
    ).resolves.toBeNull()
  })

  test("timezone_name maps a stored utc offset to an IANA zone", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "7" } as ContactModel,
        }),
        systemFieldTypes.enum.timezone_name,
      ),
    ).resolves.toBe("Asia/Bangkok")
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "-5" } as ContactModel,
        }),
        systemFieldTypes.enum.timezone_name,
      ),
    ).resolves.toBe("America/New_York")
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "+07:00" } as ContactModel,
        }),
        systemFieldTypes.enum.timezone_name,
      ),
    ).resolves.toBe("Asia/Bangkok")
  })

  test("timezone_name falls back to the raw value for an unmapped offset", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "Asia/Ho_Chi_Minh" } as ContactModel,
        }),
        systemFieldTypes.enum.timezone_name,
      ),
    ).resolves.toBe("Asia/Ho_Chi_Minh")
  })

  test("timezone_name returns null when the contact has no timezone", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: null } as ContactModel,
        }),
        systemFieldTypes.enum.timezone_name,
      ),
    ).resolves.toBeNull()
  })

  test("inbox_link opens the active conversation when available", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})
    mockResolveTenantSettings.mockResolvedValue({
      appUrl: "https://builder.example",
    })

    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.inbox_link),
    ).resolves.toBe(
      "https://builder.example/space/workspace-1/inbox?conversationId=conversation-1",
    )
  })

  test("inbox_link falls back to the inbox root without conversation context", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})
    mockResolveTenantSettings.mockResolvedValue({
      appUrl: "https://builder.example/",
    })

    await expect(
      getSystemFieldValue(
        createContext({ conversation: null }),
        systemFieldTypes.enum.inbox_link,
      ),
    ).resolves.toBe("https://builder.example/space/workspace-1/inbox")
  })

  test("contact inbox tracking fields resolve from context", async () => {
    const trackingInbox = {
      ...contactInbox,
      lastBtnTitle: "Choose plan",
      consecutiveFailedReply: 2,
      lastOutboundMessageAt: new Date("2026-01-04T03:04:05.000Z"),
      lastInputFailure: "Invalid email",
      referral: {
        ref: "launch",
        adId: "ad-123",
        adTitle: "Launch ad",
        ctwaClid: "ctwa-1",
        sourceUrl: "https://example.com/ad",
        sourcePlatform: "facebook",
      },
    } as ContactInboxModel

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_btn_title,
      ),
    ).resolves.toBe("Choose plan")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.consecutive_failed_reply,
      ),
    ).resolves.toBe("2")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_outbound_message_at,
      ),
    ).resolves.toBe("2026-01-04 03:04:05")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_ad,
      ),
    ).resolves.toBe("ad-123")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_ctwa,
      ),
    ).resolves.toBe("ctwa-1")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_ad_source_url,
      ),
    ).resolves.toBe("https://example.com/ad")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_ad_source_platform,
      ),
    ).resolves.toBe("facebook")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_input_failure,
      ),
    ).resolves.toBe("Invalid email")
  })

  test("referral fields return null when the key is absent or blank", async () => {
    const blankReferralInbox = {
      ...contactInbox,
      referral: { adTitle: "", sourceUrl: "https://example.com/ad" },
    } as ContactInboxModel

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: blankReferralInbox }),
        systemFieldTypes.enum.last_ad,
      ),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: blankReferralInbox }),
        systemFieldTypes.enum.last_ctwa,
      ),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: blankReferralInbox }),
        systemFieldTypes.enum.last_ad_source_platform,
      ),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: blankReferralInbox }),
        systemFieldTypes.enum.last_ad_source_url,
      ),
    ).resolves.toBe("https://example.com/ad")
  })

  // total_new_tagged / total_tagged have no upstream data source yet — the
  // resolver hardcodes null. This locks that in so wiring them up is deliberate.
  test("tag counters stay null until a data source exists", async () => {
    await expect(
      getSystemFieldValue(
        createContext(),
        systemFieldTypes.enum.total_new_tagged,
      ),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.total_tagged),
    ).resolves.toBeNull()
  })

  test("contact inbox passthrough fields resolve from context", async () => {
    const passthroughInbox = {
      ...contactInbox,
      webchatParentUrl: "https://shop.example/checkout",
      lastErrorLog: "(#551) This person isn't available right now.",
    } as ContactInboxModel

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: passthroughInbox }),
        systemFieldTypes.enum.user_id,
      ),
    ).resolves.toBe("source-1")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: passthroughInbox }),
        systemFieldTypes.enum.user_external_id,
      ),
    ).resolves.toBe("source-1")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: passthroughInbox }),
        systemFieldTypes.enum.webchat_parent_url,
      ),
    ).resolves.toBe("https://shop.example/checkout")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: passthroughInbox }),
        systemFieldTypes.enum.last_error_log,
      ),
    ).resolves.toBe("(#551) This person isn't available right now.")
  })

  test("contact inbox passthrough fields return null without a contact inbox", async () => {
    for (const key of [
      systemFieldTypes.enum.user_id,
      systemFieldTypes.enum.user_external_id,
      systemFieldTypes.enum.webchat_parent_url,
      systemFieldTypes.enum.last_error_log,
    ]) {
      await expect(
        getSystemFieldValue(createContext({ contactInbox: null }), key),
      ).resolves.toBeNull()
    }
  })

  test("timezone renders signed offsets from legacy and IANA storage", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "7" } as ContactModel,
        }),
        systemFieldTypes.enum.timezone,
      ),
    ).resolves.toBe("+7")
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "-5" } as ContactModel,
        }),
        systemFieldTypes.enum.timezone,
      ),
    ).resolves.toBe("-5")
    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            timezone: "Asia/Ho_Chi_Minh",
          } as ContactModel,
        }),
        systemFieldTypes.enum.timezone,
      ),
    ).resolves.toBe("+7")
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: null } as ContactModel,
        }),
        systemFieldTypes.enum.timezone,
      ),
    ).resolves.toBeNull()
  })

  test("language reads ContactInbox.language before falling back to contact locale", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, locale: "vi_VN" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            language: "en",
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.language,
      ),
    ).resolves.toBe("en")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, locale: "vi-VN" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            language: null,
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.language,
      ),
    ).resolves.toBe("vi")
  })

  test("user_source maps the stored source to a human label", async () => {
    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.user_source),
    ).resolves.toBe("Ads")

    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            source: "comments",
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.user_source,
      ),
    ).resolves.toBe("Facebook/IG Comment")
  })

  test("user_source falls back to the raw value for an unmapped source", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            source: "some_future_source",
          } as unknown as ContactInboxModel,
        }),
        systemFieldTypes.enum.user_source,
      ),
    ).resolves.toBe("some_future_source")
  })

  test("user_source returns Unknown without a contact inbox source", async () => {
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: null }),
        systemFieldTypes.enum.user_source,
      ),
    ).resolves.toBe("Unknown")
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: { ...contactInbox, source: null } as ContactInboxModel,
        }),
        systemFieldTypes.enum.user_source,
      ),
    ).resolves.toBe("Unknown")
  })

  test("comment fields resolve from the stored message pointer", async () => {
    const messageCreatedAt = new Date("2026-01-04T03:04:05.000Z")
    mockMessageFindById.mockResolvedValue({
      id: "message-1",
      createdAt: messageCreatedAt,
      sourceId: "user-comment-1",
      text: "Nice post",
      contentAttributes: { postId: "post-1" },
      type: "comment",
      messageType: "incoming",
    })

    const trackingInbox = {
      ...contactInbox,
      lastCommentMessageId: "message-1",
      lastCommentMessageAt: messageCreatedAt,
    } as ContactInboxModel

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_comment_id,
      ),
    ).resolves.toBe("user-comment-1")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_fb_comment,
      ),
    ).resolves.toBe("Nice post")
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_post_id,
      ),
    ).resolves.toBe("post-1")

    expect(mockMessageFindById).toHaveBeenCalledWith({
      id: "message-1",
      createdAt: messageCreatedAt,
      workspaceId: "workspace-1",
    })
  })

  test("comment fields ignore a deleted pointed message", async () => {
    const messageCreatedAt = new Date("2026-01-04T03:04:05.000Z")
    mockMessageFindById.mockResolvedValue({
      id: "message-1",
      createdAt: messageCreatedAt,
      sourceId: "user-comment-1",
      text: "Deleted comment",
      contentAttributes: { postId: "post-1" },
      deletedAt: new Date("2026-01-05T00:00:00.000Z"),
    })

    const trackingInbox = {
      ...contactInbox,
      lastCommentMessageId: "message-1",
      lastCommentMessageAt: messageCreatedAt,
    } as ContactInboxModel

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: trackingInbox }),
        systemFieldTypes.enum.last_comment_id,
      ),
    ).resolves.toBeNull()
  })

  test("last_commented_post_text is lazily fetched and cached", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationMessenger: {
        id: "messenger-1",
        auth: { tokens: { accessToken: "token" }, version: "v23.0" },
      },
    })
    mockMessengerGetPostDetails.mockResolvedValue({
      message: "Post text",
      created_time: "2026-01-01T00:00:00Z",
    })

    const context = createContext({
      contactInbox: {
        ...contactInbox,
        lastCommentMessageId: "message-1",
        lastCommentMessageAt: new Date("2026-01-04T03:04:05.000Z"),
      } as ContactInboxModel,
    })
    mockMessageFindById.mockResolvedValue({
      id: "message-1",
      sourceId: "user-comment-1",
      text: "Nice post",
      contentAttributes: { postId: "post-1" },
      createdAt: new Date("2026-01-04T03:04:05.000Z"),
    })

    await expect(
      getSystemFieldValue(
        context,
        systemFieldTypes.enum.last_commented_post_text,
      ),
    ).resolves.toBe("Post text")
    await expect(
      getSystemFieldValue(
        context,
        systemFieldTypes.enum.last_commented_post_text,
      ),
    ).resolves.toBe("Post text")

    expect(mockMessengerGetPostDetails).toHaveBeenCalledTimes(1)
    expect(mockMessengerGetPostDetails).toHaveBeenCalledWith({
      ctx: {
        auth: { tokens: { accessToken: "token" }, version: "v23.0" },
      },
      input: { postId: "post-1" },
    })
  })

  test("me creates a signed privacy link", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationMessenger: {
        id: "messenger-integration-1",
        name: "Messenger Page",
      },
    })
    mockResolveWorkspaceAppUrl.mockResolvedValue("https://brand.example")
    mockSystemFieldCreate.mockResolvedValue({ id: "system-field-1" })
    mockSignMeLink.mockReturnValue("signed-hash")

    const value = await getSystemFieldValue(
      createContext(),
      systemFieldTypes.enum.me,
    )

    expect(value).toBe(
      "https://brand.example/extensions/me/?w=workspace-1&u=source-1&ib=messenger-integration-1&id=system-field-1&hash=signed-hash",
    )
    expect(mockSystemFieldCreate).toHaveBeenCalledWith({
      type: "me",
      payload: {
        workspaceId: "workspace-1",
        channel: "messenger",
        integrationId: "messenger-integration-1",
        sourceId: "source-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        contactId: "contact-1",
      },
    })
    expect(mockSignMeLink).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sourceId: "source-1",
      integrationId: "messenger-integration-1",
      formId: "system-field-1",
    })
  })

  test("me returns null without creating a link when workspace is scheduled for deletion", async () => {
    const scheduledWorkspace = {
      ...workspace,
      scheduledDeletionAt: new Date("2026-07-23T00:00:00.000Z"),
    } as WorkspaceModel

    const value = await getSystemFieldValue(
      createContext({ workspace: scheduledWorkspace }),
      systemFieldTypes.enum.me,
    )

    expect(value).toBeNull()
    expect(mockFindWithIntegrationsById).not.toHaveBeenCalled()
    expect(mockResolveWorkspaceAppUrl).not.toHaveBeenCalled()
    expect(mockSystemFieldCreate).not.toHaveBeenCalled()
    expect(mockSignMeLink).not.toHaveBeenCalled()
  })

  test("location and flow step fields resolve from persisted contact state", async () => {
    mockFindDMByContact.mockResolvedValue({
      lastStep: "step-1",
      currentStep: "step-2",
    })

    const locatedContact = {
      ...contact,
      location: { latitude: 10.75, longitude: 106.66 },
    } as ContactModel

    await expect(
      getSystemFieldValue(
        createContext({ contact: locatedContact }),
        systemFieldTypes.enum.last_latitude,
      ),
    ).resolves.toBe("10.75")
    await expect(
      getSystemFieldValue(
        createContext({ contact: locatedContact }),
        systemFieldTypes.enum.last_longitude,
      ),
    ).resolves.toBe("106.66")
    await expect(
      getSystemFieldValue(
        createContext({ contact: locatedContact }),
        systemFieldTypes.enum.last_step,
      ),
    ).resolves.toBe("step-1")
    await expect(
      getSystemFieldValue(
        createContext({ contact: locatedContact }),
        systemFieldTypes.enum.current_step,
      ),
    ).resolves.toBe("step-2")
  })

  test("profile_pic resolves storage paths to public URLs", async () => {
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "http://localhost:3123/storage/",
    })

    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            avatar: "public/space/workspace-1/avatars/a.png",
          } as ContactModel,
        }),
        systemFieldTypes.enum.profile_pic,
      ),
    ).resolves.toBe(
      "http://localhost:3123/storage/public/space/workspace-1/avatars/a.png",
    )
  })

  test("avatar keeps absolute URLs and leaves null as null", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            avatar: "https://cdn.example.com/a.png",
          } as ContactModel,
        }),
        systemFieldTypes.enum.avatar,
      ),
    ).resolves.toBe("https://cdn.example.com/a.png")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            avatar: null,
          } as ContactModel,
        }),
        systemFieldTypes.enum.avatar,
      ),
    ).resolves.toBeNull()
  })

  test("account_image resolves workspace logo storage paths", async () => {
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "http://localhost:3123/storage/",
    })

    await expect(
      getSystemFieldValue(
        createContext({
          workspace: {
            ...workspace,
            logo: "public/space/workspace-1/logo.png",
          } as WorkspaceModel,
        }),
        systemFieldTypes.enum.account_image,
      ),
    ).resolves.toBe(
      "http://localhost:3123/storage/public/space/workspace-1/logo.png",
    )
  })

  test("locale2 returns the language from underscore and hyphen locales", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, locale: "en_US" } as ContactModel,
        }),
        systemFieldTypes.enum.locale2,
      ),
    ).resolves.toBe("en")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, locale: "en-US" } as ContactModel,
        }),
        systemFieldTypes.enum.locale2,
      ),
    ).resolves.toBe("en")
  })

  test("last_seen uses the context contact inbox read timestamp", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-03T03:04:05.000Z"),
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-03 03:04:05")
  })

  test("last_interaction uses the context contact inbox inbound timestamp", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: new Date("2026-01-03T03:04:05.000Z"),
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBe("2026-01-03 03:04:05")
  })

  test("last_seen and last_interaction return null when no inbox timestamp exists", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: null,
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(
        createContext({
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: null,
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBeNull()
  })

  test("subscribed_date formats the context contact inbox createdAt in the contact timezone", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "Asia/Ho_Chi_Minh" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            createdAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          // Contact timezone wins over the workspace timezone, rolling the
          // calendar date forward to the next day.
          workspace: { ...workspace, timezone: "UTC" },
        }),
        systemFieldTypes.enum.subscribed_date,
      ),
    ).resolves.toBe("2026-01-02")
  })

  test("subscribed_date returns null without a context contact inbox", async () => {
    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: null }),
        systemFieldTypes.enum.subscribed_date,
      ),
    ).resolves.toBeNull()
  })

  test("last_seen formats using the contact timezone before the workspace timezone", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...contact,
            timezone: "Asia/Ho_Chi_Minh",
          } as ContactModel,
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: { ...workspace, timezone: "UTC" },
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-02 06:30:00")
  })

  test("last_interaction falls back to the contact timezone when workspace is missing", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "Asia/Ho_Chi_Minh" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBe("2026-01-02 06:30:00")
  })

  test("last_seen and last_interaction fall back to UTC when timezone is null", async () => {
    const utcContact = { ...contact, timezone: null } as ContactModel

    await expect(
      getSystemFieldValue(
        createContext({
          contact: utcContact,
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-01 23:30:00")
    await expect(
      getSystemFieldValue(
        createContext({
          contact: utcContact,
          contactInbox: {
            ...contactInbox,
            lastIncomingMessageAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_interaction,
      ),
    ).resolves.toBe("2026-01-01 23:30:00")
  })

  test("last_seen normalizes legacy numeric contact timezone values", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "7" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            contactLastReadAt: new Date("2026-01-01T23:30:00.000Z"),
          } as ContactInboxModel,
          workspace: null,
        }),
        systemFieldTypes.enum.last_seen,
      ),
    ).resolves.toBe("2026-01-02 06:30:00")
  })
})

const profileContact = {
  ...contact,
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phoneNumber: "+84900000000",
  country: "VN",
  state: "Ho Chi Minh",
  city: "Thu Duc",
  gender: "female",
  timezone: "7",
} as ContactModel

describe("getSystemFieldValue — contact profile columns", () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  test("reads plain contact columns straight through", async () => {
    const context = createContext({ contact: profileContact })
    const expected: [string, string][] = [
      [systemFieldTypes.enum.first_name, "Ada"],
      [systemFieldTypes.enum.last_name, "Lovelace"],
      [systemFieldTypes.enum.email, "ada@example.com"],
      [systemFieldTypes.enum.phone, "+84900000000"],
      [systemFieldTypes.enum.user_country, "VN"],
      [systemFieldTypes.enum.user_state, "Ho Chi Minh"],
      [systemFieldTypes.enum.user_city, "Thu Duc"],
      // timezone follows the ChatRace signed-offset shape; timezone_name maps to IANA.
      [systemFieldTypes.enum.timezone, "+7"],
    ]

    for (const [key, value] of expected) {
      await expect(getSystemFieldValue(context, key)).resolves.toBe(value)
    }
  })

  test("full_name joins the parts and drops the missing half", async () => {
    await expect(
      getSystemFieldValue(
        createContext({ contact: profileContact }),
        systemFieldTypes.enum.full_name,
      ),
    ).resolves.toBe("Ada Lovelace")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...profileContact, lastName: null } as ContactModel,
        }),
        systemFieldTypes.enum.full_name,
      ),
    ).resolves.toBe("Ada")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: {
            ...profileContact,
            firstName: null,
            lastName: null,
          } as ContactModel,
        }),
        systemFieldTypes.enum.full_name,
      ),
    ).resolves.toBe("")
  })

  test("gender is localised through the workspace language", async () => {
    mockResolveGenderLabel.mockReturnValue("Chị")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: profileContact,
          workspace: { ...workspace, language: "vi" } as WorkspaceModel,
        }),
        systemFieldTypes.enum.gender,
      ),
    ).resolves.toBe("Chị")
    expect(mockResolveGenderLabel).toHaveBeenCalledWith("vi", "female")
  })

  test("gender passes an undefined language when there is no workspace", async () => {
    mockResolveGenderLabel.mockReturnValue("Anh/Chị")

    await expect(
      getSystemFieldValue(
        createContext({ contact: profileContact, workspace: null }),
        systemFieldTypes.enum.gender,
      ),
    ).resolves.toBe("Anh/Chị")
    expect(mockResolveGenderLabel).toHaveBeenCalledWith(undefined, "female")
  })

  test("last_ref prefers the contact column over the referral payload", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, ref: "from-contact" } as ContactModel,
          contactInbox: {
            ...contactInbox,
            referral: { ref: "from-referral" },
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_ref,
      ),
    ).resolves.toBe("from-contact")
  })

  test("last_ref falls back to the referral payload, then to null", async () => {
    const refless = { ...contact, ref: null } as ContactModel

    await expect(
      getSystemFieldValue(
        createContext({
          contact: refless,
          contactInbox: {
            ...contactInbox,
            referral: { ref: "from-referral" },
          } as ContactInboxModel,
        }),
        systemFieldTypes.enum.last_ref,
      ),
    ).resolves.toBe("from-referral")

    await expect(
      getSystemFieldValue(
        createContext({ contact: refless, contactInbox: null }),
        systemFieldTypes.enum.last_ref,
      ),
    ).resolves.toBeNull()
  })

  test("last_order stays null until an order source exists", async () => {
    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.last_order),
    ).resolves.toBeNull()
  })
})

describe("getSystemFieldValue — workspace and account fields", () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  test("workspace and account aliases resolve from the same sources", async () => {
    const context = createContext()

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.workspace_id),
    ).resolves.toBe("workspace-1")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.account_id),
    ).resolves.toBe("workspace-1")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.workspace_name),
    ).resolves.toBe("Workspace One")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.account_name),
    ).resolves.toBe("Workspace One")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.api_key),
    ).resolves.toBe("workspace-token")
  })

  test("workspace-backed fields are null without a workspace, but ids survive", async () => {
    const context = createContext({ workspace: null })

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.workspace_name),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.account_name),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.api_key),
    ).resolves.toBeNull()
    // Both ids come off the contact, so they hold even without the workspace row.
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.workspace_id),
    ).resolves.toBe("workspace-1")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.account_id),
    ).resolves.toBe("workspace-1")
  })
})

describe("getSystemFieldValue — clock fields", () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("current_time uses workspace timezone while current_user_time uses contact timezone first", async () => {
    const context = createContext({
      contact: { ...profileContact, timezone: "Asia/Tokyo" } as ContactModel,
      workspace: { ...workspace, timezone: "Asia/Bangkok" } as WorkspaceModel,
    })

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.current_time),
    ).resolves.toBe("2026-01-02 10:04:05")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.current_user_time),
    ).resolves.toBe("2026-01-02 12:04:05")
  })

  test("clock fields fall back to the contact timezone, then to UTC", async () => {
    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: "Asia/Tokyo" } as ContactModel,
          workspace: null,
        }),
        systemFieldTypes.enum.current_user_time,
      ),
    ).resolves.toBe("2026-01-02 12:04:05")

    await expect(
      getSystemFieldValue(
        createContext({
          contact: { ...contact, timezone: null } as ContactModel,
          workspace: null,
        }),
        systemFieldTypes.enum.current_time,
      ),
    ).resolves.toBe("2026-01-02 03:04:05")
  })
})

describe("getSystemFieldValue — appointment fields", () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  test("booking fields resolve from explicit appointment context", async () => {
    mockAppointmentFindBy.mockResolvedValue({
      id: "appointment-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      startAt: new Date("2026-01-02T03:04:05.000Z"),
      inviteeTimezone: "Asia/Ho_Chi_Minh",
      calendar: { name: "Discovery Call" },
    })
    const context = createContext({ appointmentId: "appointment-1" })

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.booking_calendar),
    ).resolves.toBe("Discovery Call")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.booking_date),
    ).resolves.toBe("2026-01-02 10:04:05")

    expect(mockAppointmentFindBy).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "appointment-1",
    })
  })

  test("booking fields do not guess without explicit appointment context", async () => {
    await expect(
      getSystemFieldValue(
        createContext(),
        systemFieldTypes.enum.booking_calendar,
      ),
    ).resolves.toBeNull()
    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.booking_date),
    ).resolves.toBeNull()

    expect(mockAppointmentFindBy).not.toHaveBeenCalled()
  })
})

describe("getSystemFieldValue — inbox identity fields", () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  test("page_user_name reads the integration name for the inbox channel", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({
      integrationMessenger: { id: "messenger-1", name: "Acme Page" },
    })

    await expect(
      getSystemFieldValue(
        createContext(),
        systemFieldTypes.enum.page_user_name,
      ),
    ).resolves.toBe("Acme Page")
  })

  test("page_user_name is null when the channel has no integration row", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})

    await expect(
      getSystemFieldValue(
        createContext(),
        systemFieldTypes.enum.page_user_name,
      ),
    ).resolves.toBeNull()
  })

  test("user_code exposes the platform-side contact id", async () => {
    mockFindWithIntegrationsById.mockResolvedValue({})

    await expect(
      getSystemFieldValue(createContext(), systemFieldTypes.enum.user_code),
    ).resolves.toBe("source-1")
  })

  test("integration-backed fields are null without a contact inbox", async () => {
    mockFindRecentByContactId.mockResolvedValue(null)

    await expect(
      getSystemFieldValue(
        createContext({ contactInbox: null }),
        systemFieldTypes.enum.user_code,
      ),
    ).resolves.toBeNull()
    expect(mockFindWithIntegrationsById).not.toHaveBeenCalled()
  })
})
