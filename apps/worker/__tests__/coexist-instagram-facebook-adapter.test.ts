import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockExtractContactInfo,
  mockFindIntegration,
  mockInboxFind,
  mockWorkspaceFind,
} = vi.hoisted(() => ({
  mockExtractContactInfo: vi.fn(),
  mockFindIntegration: vi.fn(),
  mockInboxFind: vi.fn(),
  mockWorkspaceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: { findIntegrationForCoexist: mockFindIntegration },
  extractContactInfo: mockExtractContactInfo,
  inboxService: { find: mockInboxFind },
  workspaceService: { find: mockWorkspaceFind },
}))

vi.mock("@chatbotx.io/integration-instagram-facebook/apis/sync", () => ({
  fetchInstagramFacebookConversationMessages: vi.fn(),
  listInstagramFacebookConversations: vi.fn(),
}))

import {
  type InstagramFacebookCoexistContext,
  instagramFacebookCoexistAdapter,
} from "../src/integration/handlers/coexist/instagram-facebook-adapter"

const context = {
  integration: {
    id: "ig-fb-int-1",
    channel: "instagram" as const,
  } as InstagramFacebookCoexistContext["integration"],
  inbox: {} as InstagramFacebookCoexistContext["inbox"],
  workspaceId: "ws-1",
  accessToken: "page-token-1",
  version: "v22.0",
  igId: "ig-business-1",
  pageId: "page-1",
  defaultCountry: "VN",
} satisfies InstagramFacebookCoexistContext

const facebookIntegration = {
  id: "ig-fb-int-1",
  inboxId: "inbox-1",
  channel: "instagram",
  type: "facebook",
  coexistEnabled: true,
  auth: {
    tokens: { accessToken: "page-token-1" },
    metadata: { igId: "ig-business-1", pageId: "page-1", version: "v22.0" },
  },
}

describe("instagramFacebookCoexistAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads context for a Facebook-linked Instagram integration", async () => {
    mockFindIntegration.mockResolvedValue(facebookIntegration)
    mockInboxFind.mockResolvedValue({ id: "inbox-1" })
    mockWorkspaceFind.mockResolvedValue({ targetCountry: "VN" })

    const loaded = await instagramFacebookCoexistAdapter.loadContext({
      workspaceId: "ws-1",
      integrationId: "ig-fb-int-1",
    })

    expect(loaded).toEqual(
      expect.objectContaining({
        accessToken: "page-token-1",
        igId: "ig-business-1",
        pageId: "page-1",
        version: "v22.0",
        defaultCountry: "VN",
      }),
    )
  })

  it("rejects a native Instagram integration — that belongs to the native adapter", async () => {
    mockFindIntegration.mockResolvedValue({
      ...facebookIntegration,
      type: "instagram",
    })

    const loaded = await instagramFacebookCoexistAdapter.loadContext({
      workspaceId: "ws-1",
      integrationId: "ig-fb-int-1",
    })

    expect(loaded).toBeNull()
  })

  it("does not implement resolveContactProfile (Meta blocks reading historical user profiles)", () => {
    expect(
      instagramFacebookCoexistAdapter.resolveContactProfile,
    ).toBeUndefined()
  })

  it("resolves a contact from message details when participants are absent", () => {
    const contact = instagramFacebookCoexistAdapter.resolveContact({
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
    })
  })

  it("maps messages to historical messages with direction and attachments", () => {
    const message = instagramFacebookCoexistAdapter.toHistoricalMessage({
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
    const message = instagramFacebookCoexistAdapter.toHistoricalMessage({
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

    const enrichment =
      instagramFacebookCoexistAdapter.discoverContactEnrichment({
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
  })
})
