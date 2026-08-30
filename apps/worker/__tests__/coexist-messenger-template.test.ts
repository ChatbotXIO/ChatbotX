import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// fetchConvMessages maps Page button templates (Graph `generic_template`) into
// stored messages: text = title, buttons in contentAttributes (type "template",
// templateType "button") so the inbox renders text + buttons.
//
// Mock the Graph sync API + break the @chatbotx.io/business pino import chain.
// ---------------------------------------------------------------------------

const { mockListMessages } = vi.hoisted(() => ({ mockListMessages: vi.fn() }))
vi.mock("@chatbotx.io/integration-messenger/apis/sync", () => ({
  listMessages: mockListMessages,
}))

vi.mock("@chatbotx.io/business", () => ({
  extractContactInfo: () => ({}),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { fetchConvMessages } from "../src/heavy/handlers/coexist/messenger-helpers"

type GraphAttachment = Record<string, unknown>

function makePage(attachments: GraphAttachment[], message = "") {
  return {
    data: [
      {
        id: "m_1",
        message,
        from: { id: "page-1" },
        created_time: "2026-06-05T00:00:00.000Z",
        attachments: { data: attachments },
      },
    ],
    after: undefined,
    bucUsage: null,
  }
}

const baseProps = {
  conversationId: "conv-1",
  accessToken: "token",
  cutoff: new Date("2020-01-01T00:00:00.000Z"),
  ceiling: null,
  pageId: "page-1",
  defaultCountry: null,
  applyBucThrottle: () => undefined,
  respectPause: () => Promise.resolve(),
}

describe("fetchConvMessages — generic_template (Page button templates)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("maps a postback button template to text + contentAttributes (not skipped despite empty message)", async () => {
    mockListMessages.mockResolvedValue(
      makePage([
        {
          id: "att-1",
          generic_template: {
            title: "test1",
            cta: [{ title: "Button #1", type: "postback" }],
          },
        },
      ]),
    )

    const result = await fetchConvMessages(baseProps)

    expect(result.messages).toHaveLength(1)
    const msg = result.messages[0]
    expect(msg.contentType).toBe("text")
    expect(msg.text).toBe("test1")
    expect(msg.messageType).toBe("outgoing")
    expect(msg.contentAttributes).toEqual({
      type: "template",
      payload: {
        templateType: "button",
        buttons: [
          {
            id: "att-1-0",
            label: "Button #1",
            buttonType: "postback",
            postback: "",
          },
        ],
      },
    })
  })

  test("maps a web_url cta to a url button", async () => {
    mockListMessages.mockResolvedValue(
      makePage([
        {
          id: "att-2",
          generic_template: {
            title: "Visit us",
            cta: [
              { title: "Open", type: "web_url", url: "https://example.com" },
            ],
          },
        },
      ]),
    )

    const result = await fetchConvMessages(baseProps)

    const msg = result.messages[0]
    expect(msg.text).toBe("Visit us")
    expect(msg.contentAttributes).toEqual({
      type: "template",
      payload: {
        templateType: "button",
        buttons: [
          {
            id: "att-2-0",
            label: "Open",
            buttonType: "url",
            url: "https://example.com",
          },
        ],
      },
    })
  })

  test("keeps message text when both text and a button template are present", async () => {
    mockListMessages.mockResolvedValue(
      makePage(
        [
          {
            id: "att-3",
            generic_template: {
              title: "ignored title",
              cta: [{ title: "Yes", type: "postback" }],
            },
          },
        ],
        "actual message text",
      ),
    )

    const result = await fetchConvMessages(baseProps)

    const msg = result.messages[0]
    // Real message text wins over the template title.
    expect(msg.text).toBe("actual message text")
    expect(msg.contentAttributes).toMatchObject({
      type: "template",
      payload: { templateType: "button" },
    })
  })

  test("does not attach contentAttributes for a plain media attachment", async () => {
    mockListMessages.mockResolvedValue(
      makePage([
        {
          id: "att-4",
          mime_type: "image/png",
          image_data: { url: "https://cdn.example.com/x.png" },
        },
      ]),
    )

    const result = await fetchConvMessages(baseProps)

    const msg = result.messages[0]
    expect(msg.contentAttributes).toBeUndefined()
    expect(msg.attachments).toHaveLength(1)
  })
})
