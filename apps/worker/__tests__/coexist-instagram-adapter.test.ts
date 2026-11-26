import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockExtractContactInfo,
  mockFetchConversationMessages,
  mockFetchParticipantProfile,
  mockListConversations,
} = vi.hoisted(() => ({
  mockExtractContactInfo: vi.fn(),
  mockFetchConversationMessages: vi.fn(),
  mockFetchParticipantProfile: vi.fn(),
  mockListConversations: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-instagram/apis/sync", () => ({
  fetchInstagramConversationMessages: mockFetchConversationMessages,
  fetchInstagramParticipantProfile: mockFetchParticipantProfile,
  listInstagramConversations: mockListConversations,
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: { findIntegrationForCoexist: vi.fn() },
  extractContactInfo: mockExtractContactInfo,
  inboxService: { find: vi.fn() },
  workspaceService: { find: vi.fn() },
}))

import {
  coexistService,
  inboxService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  type InstagramCoexistContext,
  instagramCoexistAdapter,
} from "../src/integration/handlers/coexist/instagram-adapter"

const context = {
  integration: {
    id: "ig-int-1",
    channel: "instagram" as const,
  } as InstagramCoexistContext["integration"],
  inbox: {} as InstagramCoexistContext["inbox"],
  workspaceId: "ws-1",
  accessToken: "token-1",
  igId: "ig-business-1",
  defaultCountry: "VN",
} satisfies InstagramCoexistContext

describe("instagramCoexistAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolves a contact from message details when participants are absent", () => {
    const contact = instagramCoexistAdapter.resolveContact({
      context,
      conversation: { id: "conv-1" },
      messages: [
        {
          id: "msg-1",
          from: {
            id: "customer-1",
            username: "customer_one",
            name: "Customer One",
          },
        },
      ],
    })

    expect(contact).toEqual({
      sourceId: "customer-1",
      firstName: "Customer",
      lastName: "One",
      sourceUsername: "customer_one",
    })
  })

  it("maps Instagram messages to historical messages with direction and attachments", () => {
    const message = instagramCoexistAdapter.toHistoricalMessage({
      context,
      cutoff: new Date("2026-01-01T00:00:00.000Z"),
      totalMessagesSeen: 1,
      message: {
        id: "msg-2",
        message: "sent by business",
        created_time: "2026-08-01T10:00:00+0000",
        from: { id: "ig-business-1" },
        attachments: {
          data: [
            {
              id: "att-1",
              mime_type: "image/png",
              image_data: {
                url: "https://cdn.example/image.png",
                width: 640,
                height: 480,
              },
              size: 1234,
            },
          ],
        },
      },
    })

    expect(message).toEqual(
      expect.objectContaining({
        sourceId: "msg-2",
        messageType: "outgoing",
        text: "sent by business",
        createdAt: new Date("2026-08-01T10:00:00+0000"),
      }),
    )
    expect(message?.attachments).toEqual([
      expect.objectContaining({
        sourceId: "att-1",
        originPath: "https://cdn.example/image.png",
        mimeType: "image/png",
        width: 640,
        height: 480,
      }),
    ])
  })

  it("skips ref-only messages that cannot be hydrated by the API layer", () => {
    const message = instagramCoexistAdapter.toHistoricalMessage({
      context,
      cutoff: new Date("2026-01-01T00:00:00.000Z"),
      totalMessagesSeen: 1,
      message: { id: "msg-ref-only" },
    })

    expect(message).toBeNull()
  })

  it("discovers contact enrichment from imported message text once per field", () => {
    mockExtractContactInfo
      .mockReturnValueOnce({ phoneNumber: "+84901234567" })
      .mockReturnValueOnce({ email: "person@example.com" })

    const enrichment = instagramCoexistAdapter.discoverContactEnrichment({
      context,
      messages: [
        {
          sourceId: "msg-1",
          messageType: "incoming",
          contentType: "text",
          text: "phone +84 901 234 567",
        },
        {
          sourceId: "msg-2",
          messageType: "incoming",
          contentType: "text",
          text: "email person@example.com",
        },
      ],
    })

    expect(enrichment).toEqual({
      phoneNumber: "+84901234567",
      email: "person@example.com",
    })
    expect(mockExtractContactInfo).toHaveBeenCalledWith(
      "phone +84 901 234 567",
      "VN",
      { skipPhone: false, skipEmail: false },
    )
    expect(mockExtractContactInfo).toHaveBeenCalledWith(
      "email person@example.com",
      "VN",
      { skipPhone: true, skipEmail: false },
    )
  })
})

describe("instagramCoexistAdapter with Meta Unified Login", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the Unified login type from the stored auth", async () => {
    vi.mocked(coexistService.findIntegrationForCoexist).mockResolvedValue({
      id: "ig-int-1",
      channel: "instagram",
      type: "instagram",
      coexistEnabled: true,
      inboxId: "inbox-1",
      auth: {
        tokens: { accessToken: "system-user-token" },
        metadata: {
          igId: "ig-business-1",
          version: "v22.0",
          loginType: "unified",
        },
      },
    } as never)
    vi.mocked(inboxService.find).mockResolvedValue({ id: "inbox-1" } as never)
    vi.mocked(workspaceService.find).mockResolvedValue({
      targetCountry: "VN",
    } as never)

    const loaded = await instagramCoexistAdapter.loadContext({
      workspaceId: "ws-1",
      integrationId: "ig-int-1",
    })

    expect(loaded).toEqual(
      expect.objectContaining({
        accessToken: "system-user-token",
        igId: "ig-business-1",
        loginType: "unified",
      }),
    )
  })

  it("passes the Unified login type to every Graph read", async () => {
    const unifiedContext = { ...context, loginType: "unified" as const }
    mockListConversations.mockResolvedValue({ data: [], after: undefined })
    mockFetchConversationMessages.mockResolvedValue({
      data: [],
      after: undefined,
    })
    mockFetchParticipantProfile.mockResolvedValue({ profile: {} })

    await instagramCoexistAdapter.listConversations({
      context: unifiedContext,
      cursor: undefined,
    } as never)
    await instagramCoexistAdapter.fetchConversationMessages({
      context: unifiedContext,
      conversationId: "conversation-1",
      cursor: undefined,
    } as never)
    await instagramCoexistAdapter.resolveContactProfile?.({
      context: unifiedContext,
      sourceId: "customer-1",
    } as never)

    for (const mock of [
      mockListConversations,
      mockFetchConversationMessages,
      mockFetchParticipantProfile,
    ]) {
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({ loginType: "unified" }),
      )
    }
  })
})
