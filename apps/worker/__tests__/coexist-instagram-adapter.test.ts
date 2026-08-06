import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockExtractContactInfo } = vi.hoisted(() => ({
  mockExtractContactInfo: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: { findIntegrationForCoexist: vi.fn() },
  extractContactInfo: mockExtractContactInfo,
  inboxService: { find: vi.fn() },
  workspaceService: { find: vi.fn() },
}))

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
