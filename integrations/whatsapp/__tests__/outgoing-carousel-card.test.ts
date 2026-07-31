import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockApiFetch, mockGetWhatsappClient, mockSendMessage, mockLogger } =
  vi.hoisted(() => {
    const sendMessage = vi.fn()
    const apiFetch = vi.fn()
    return {
      mockApiFetch: apiFetch,
      mockGetWhatsappClient: vi.fn(() => ({
        $$apiFetch$$: apiFetch,
        sendMessage,
      })),
      mockSendMessage: sendMessage,
      mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }
  })

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const FLOW_ID = "1000000000001"
const FLOW_VERSION_ID = "1000000000002"
const PHONE_NUMBER_ID = "pn-1"
const IMAGE_URL = "https://example.com/card.png"

const ctx = {
  auth: {
    metadata: {
      phoneNumber: { id: PHONE_NUMBER_ID },
    },
  },
} as never

const contactInboxId = "contact-1"

const contact = {
  id: contactInboxId,
  sourceId: "84123456789",
} as never

type CardOverrides = {
  id?: string
  title?: string
  subtitle?: string
  imageUrl?: string
  buttons?: ReturnType<typeof makeButton>[]
}

/**
 * Mirrors `sendCardStepDefaultFn()`: the builder always persists an `image`
 * object, so an un-uploaded picture arrives as `{ url: "" }` rather than
 * `undefined`.
 */
const makeCard = (overrides: CardOverrides = {}) => ({
  id: overrides.id ?? "card-1",
  stepType: "sendCard",
  title: overrides.title ?? "Card title",
  subtitle: overrides.subtitle ?? "Card subtitle",
  image: {
    id: "image-1",
    stepType: "sendImage",
    mode: "file",
    url: overrides.imageUrl ?? "",
    buttons: [],
  },
  buttons: overrides.buttons ?? [],
})

const makeButton = (id: string, label: string) => ({
  id,
  label,
  buttonType: null,
  beforeStep: null,
  steps: [],
})

const makeWebsiteButton = (id: string, label: string, url: string) => ({
  id,
  label,
  buttonType: "openWebsite",
  beforeStep: {
    id: `${id}-open`,
    stepType: "openWebsite",
    url,
    browserSize: 100,
  },
  steps: [],
})

const makeQuickReply = (id: string, label: string) => ({
  id,
  label,
  buttonType: "postback",
  postback: `${FLOW_ID}:${FLOW_VERSION_ID}:${id}`,
})

const sendCards = (
  cards: ReturnType<typeof makeCard>[],
  quickReplies?: ReturnType<typeof makeQuickReply>[],
) =>
  sendFlowStep({
    ctx,
    data: {
      contact,
      flowId: FLOW_ID,
      flowVersionId: FLOW_VERSION_ID,
      step: {
        id: "carousel-1",
        stepType: "sendCarousel",
        layout: "horizontal",
        cards,
      },
      quickReplies,
    },
  } as never)

const sendTemplate = () =>
  sendFlowStep({
    ctx,
    data: {
      contact,
      step: {
        id: "template-1",
        stepType: "sendWaTemplateMessage",
        template: {
          name: "order_update",
          language: "en_US",
          params: {
            body: [{ type: "text", text: "Order 123" }],
          },
        },
      },
    },
  } as never)

const sentMessages = () =>
  mockSendMessage.mock.calls.map((call) => call[2] as Record<string, unknown>)

const rawPayloads = () =>
  mockApiFetch.mock.calls.map((call) =>
    JSON.parse((call[1] as RequestInit).body as string),
  ) as Array<{
    interactive: {
      action: { cards: Record<string, unknown>[] }
      body: { text: string }
      type: string
    }
    recipient_type: string
    to: string
    type: string
  }>

describe("whatsapp outgoing card", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ input: contact.sourceId, wa_id: contact.sourceId }],
          messages: [{ id: "wamid.raw-1" }],
        }),
        { status: 200 },
      ),
    )
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.provider-1" }],
    })
  })

  test("renders an image card with buttons as one interactive message", async () => {
    const result = await sendCards(
      [
        makeCard({
          imageUrl: IMAGE_URL,
          buttons: [makeButton("1000000000003", "Open")],
        }),
      ],
      [makeQuickReply("1000000000004", "Later")],
    )

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledWith(
      PHONE_NUMBER_ID,
      contact.sourceId,
      expect.objectContaining({
        _type: "interactive",
        type: "button",
        body: expect.objectContaining({ text: "Card title" }),
        footer: expect.objectContaining({ text: "Card subtitle" }),
        header: expect.objectContaining({
          type: "image",
          image: expect.objectContaining({ link: IMAGE_URL }),
        }),
        action: expect.objectContaining({
          buttons: [
            expect.objectContaining({
              reply: expect.objectContaining({
                id: `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000003`,
                title: "Open",
              }),
            }),
            expect.objectContaining({
              reply: expect.objectContaining({
                id: `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000004`,
                title: "Later",
              }),
            }),
          ],
        }),
      }),
    )
    expect(result).toEqual({ messageIds: ["wamid.provider-1"] })
  })

  test("omits the header when the card has no uploaded image", async () => {
    await sendCards([makeCard()], [makeQuickReply("1000000000004", "Later")])

    expect(mockSendMessage).toHaveBeenCalledOnce()
    const [message] = sentMessages()
    expect(message).toMatchObject({
      _type: "interactive",
      type: "button",
      body: { text: "Card title" },
      footer: { text: "Card subtitle" },
    })
    expect(message.header).toBeUndefined()
  })

  test("renders a button-less image card as a single captioned image", async () => {
    await sendCards([makeCard({ imageUrl: IMAGE_URL })])

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(sentMessages()[0]).toMatchObject({
      _type: "image",
      link: IMAGE_URL,
      caption: "Card title\nCard subtitle",
    })
  })

  test("renders a button-less card without an image as a single text message", async () => {
    await sendCards([makeCard()])

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(sentMessages()[0]).toMatchObject({
      _type: "text",
      body: "Card title\nCard subtitle",
    })
  })

  test("sends multiple cards as one interactive carousel without node quick replies", async () => {
    await sendCards(
      [
        makeCard({
          id: "card-1",
          title: "First",
          imageUrl: IMAGE_URL,
          buttons: [makeButton("1000000000003", "Choose")],
        }),
        makeCard({
          id: "card-2",
          title: "Second",
          imageUrl: IMAGE_URL,
          buttons: [makeButton("1000000000005", "Choose")],
        }),
        makeCard({
          id: "card-3",
          title: "Third",
          imageUrl: IMAGE_URL,
          buttons: [makeButton("1000000000006", "Choose")],
        }),
      ],
      [makeQuickReply("1000000000004", "Later")],
    )

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockApiFetch).toHaveBeenCalledOnce()
    const [payload] = rawPayloads()
    expect(payload).toMatchObject({
      recipient_type: "individual",
      to: contact.sourceId,
      type: "interactive",
      interactive: {
        type: "carousel",
        body: { text: "." },
      },
    })
    expect(payload.interactive.action.cards).toEqual([
      expect.objectContaining({
        card_index: 0,
        type: "cta_url",
        header: { type: "image", image: { link: IMAGE_URL } },
        body: { text: "First\nCard subtitle" },
        action: {
          buttons: [
            {
              type: "quick_reply",
              quick_reply: {
                id: `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000003`,
                title: "Choose",
              },
            },
          ],
        },
      }),
      expect.objectContaining({ card_index: 1, type: "cta_url" }),
      expect.objectContaining({ card_index: 2, type: "cta_url" }),
    ])
    for (const card of payload.interactive.action.cards) {
      expect(card).not.toHaveProperty("footer")
    }
  })

  test("maps optional card body and header fields without repairing invalid cards", async () => {
    await sendCards([
      makeCard({
        id: "card-1",
        title: "Title",
        subtitle: "Subtitle",
        imageUrl: IMAGE_URL,
        buttons: [],
      }),
      makeCard({
        id: "card-2",
        title: "",
        subtitle: "Only subtitle",
        imageUrl: "",
        buttons: [],
      }),
      makeCard({
        id: "card-3",
        title: "",
        subtitle: "",
        imageUrl: IMAGE_URL,
        buttons: [],
      }),
    ])

    const cards = rawPayloads()[0].interactive.action.cards
    expect(cards[0]).toMatchObject({ body: { text: "Title\nSubtitle" } })
    expect(cards[0]).not.toHaveProperty("action")
    expect(cards[1]).toMatchObject({ body: { text: "Only subtitle" } })
    expect(cards[1]).not.toHaveProperty("header")
    expect(cards[2]).not.toHaveProperty("body")
    expect(cards[2]).not.toHaveProperty("action")
  })

  test("clamps carousel card text and button labels to Meta limits", async () => {
    await sendCards([
      makeCard({
        id: "card-1",
        title: "T".repeat(100),
        subtitle: "S".repeat(100),
        imageUrl: IMAGE_URL,
        buttons: [makeButton("1000000000003", "L".repeat(30))],
      }),
      makeCard({
        id: "card-2",
        imageUrl: IMAGE_URL,
        buttons: [makeButton("1000000000005", "L".repeat(30))],
      }),
    ])

    const cards = rawPayloads()[0].interactive.action.cards as Array<{
      action: { buttons: Array<{ quick_reply: { title: string } }> }
      body: { text: string }
    }>
    expect(cards[0].body.text).toHaveLength(160)
    expect(cards[0].action.buttons[0].quick_reply.title).toHaveLength(20)
  })

  test("sends a lone openWebsite button as a link button", async () => {
    await sendCards([
      makeCard({
        id: "card-1",
        imageUrl: IMAGE_URL,
        buttons: [
          makeWebsiteButton(
            "1000000000003",
            "L".repeat(30),
            "https://example.com/products/1",
          ),
        ],
      }),
      makeCard({
        id: "card-2",
        imageUrl: IMAGE_URL,
        buttons: [
          makeWebsiteButton(
            "1000000000005",
            "Visit",
            "https://example.com/products/2",
          ),
        ],
      }),
    ])

    const cards = rawPayloads()[0].interactive.action.cards
    expect(cards[0]).toMatchObject({
      action: {
        name: "cta_url",
        parameters: {
          display_text: "L".repeat(20),
          // A plain URL carries no click code, so it is sent untouched.
          url: "https://example.com/products/1",
        },
      },
    })
    expect(cards[1]).toMatchObject({
      action: { parameters: { url: "https://example.com/products/2" } },
    })
  })

  test("carries the contact inbox id on a magic link", async () => {
    await sendCards([
      makeCard({
        id: "card-1",
        imageUrl: IMAGE_URL,
        buttons: [
          makeWebsiteButton(
            "1000000000003",
            "Open",
            "https://app.example.com/r/workspace-1/promo",
          ),
        ],
      }),
      makeCard({
        id: "card-2",
        imageUrl: IMAGE_URL,
        buttons: [
          makeWebsiteButton(
            "1000000000005",
            "Open",
            "https://app.example.com/r/workspace-1/promo",
          ),
        ],
      }),
    ])

    const [card] = rawPayloads()[0].interactive.action.cards as Array<{
      action: { parameters: { url: string } }
    }>
    const code = new URL(card.action.parameters.url).searchParams.get("code")

    // Trailing empty segments hold the broadcast and sequence ids, which a flow
    // send leaves out — the redirect route reads the contact inbox id last.
    expect(code).toBe(
      `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000003:::${contactInboxId}`,
    )
  })

  test("falls back to replies when a card mixes a link with a reply", async () => {
    const url = "https://example.com/products/1"
    await sendCards([
      makeCard({
        id: "card-1",
        imageUrl: IMAGE_URL,
        buttons: [
          makeWebsiteButton("1000000000003", "Open", url),
          makeButton("1000000000004", "Reply"),
        ],
      }),
      makeCard({
        id: "card-2",
        imageUrl: IMAGE_URL,
        buttons: [
          makeWebsiteButton("1000000000005", "Open", url),
          makeButton("1000000000006", "Reply"),
        ],
      }),
    ])

    // Meta accepts one URL button or several replies, never a mix, so the whole
    // card degrades to replies rather than losing its extra buttons.
    expect(rawPayloads()[0].interactive.action.cards[0]).toMatchObject({
      action: {
        buttons: [
          {
            type: "quick_reply",
            quick_reply: {
              id: `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000003`,
              title: "Open",
            },
          },
          {
            type: "quick_reply",
            quick_reply: {
              id: `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000004`,
              title: "Reply",
            },
          },
        ],
      },
    })
  })

  /**
   * Publish rejects this shape for a WhatsApp node, but an `omnichannel` node
   * carries no WhatsApp rule and still lands here, so the send path is the last
   * place the loss can be reported. Meta accepts the degraded payload, so
   * without this warning the button simply stops opening its link.
   */
  test("warns that a mixed card's link is dropped", async () => {
    const url = "https://example.com/products/1"
    await sendCards([
      makeCard({
        id: "card-1",
        imageUrl: IMAGE_URL,
        buttons: [
          makeWebsiteButton("1000000000003", "Open", url),
          makeButton("1000000000004", "Reply"),
        ],
      }),
      makeCard({
        id: "card-2",
        imageUrl: IMAGE_URL,
        buttons: [makeButton("1000000000006", "Reply")],
      }),
    ])

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ cardIndex: 0, buttonId: "1000000000003" }),
      expect.stringContaining("link button"),
    )
  })

  test("does not warn when a card's lone link button keeps its url", async () => {
    const url = "https://example.com/products/1"
    await sendCards([
      makeCard({
        id: "card-1",
        imageUrl: IMAGE_URL,
        buttons: [makeWebsiteButton("1000000000003", "Open", url)],
      }),
      makeCard({
        id: "card-2",
        imageUrl: IMAGE_URL,
        buttons: [makeWebsiteButton("1000000000005", "Visit", url)],
      }),
    ])

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test("keeps duplicate reply labels across cards", async () => {
    await sendCards([
      makeCard({
        id: "card-1",
        imageUrl: IMAGE_URL,
        buttons: [makeButton("1000000000003", "Same")],
      }),
      makeCard({
        id: "card-2",
        imageUrl: IMAGE_URL,
        buttons: [makeButton("1000000000005", "Same")],
      }),
    ])

    const cards = rawPayloads()[0].interactive.action.cards as Array<{
      action: { buttons: Array<{ quick_reply: { title: string } }> }
    }>
    expect(
      cards.map((card) => card.action.buttons[0].quick_reply.title),
    ).toEqual(["Same", "Same"])
  })

  test.each([
    [10, [10]],
    [11, [9, 2]],
    [12, [10, 2]],
    [21, [10, 9, 2]],
  ])("chunks %i cards into valid carousel sizes", async (count, sizes) => {
    mockApiFetch.mockImplementation(() => {
      const requestNumber = mockApiFetch.mock.calls.length
      return new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ input: contact.sourceId, wa_id: contact.sourceId }],
          messages: [{ id: `wamid.raw-${requestNumber}` }],
        }),
        { status: 200 },
      )
    })

    const result = await sendCards(
      Array.from({ length: count }, (_, index) =>
        makeCard({
          id: `card-${index}`,
          imageUrl: IMAGE_URL,
          buttons: [makeButton(`${1_000_000_000_100 + index}`, "Choose")],
        }),
      ),
    )

    expect(
      rawPayloads().map((payload) => payload.interactive.action.cards.length),
    ).toEqual(sizes)
    expect(result.messageIds).toEqual(
      sizes.map((_, index) => `wamid.raw-${index + 1}`),
    )
  })

  test("sends no message for an empty carousel", async () => {
    await sendCards([])

    expect(mockApiFetch).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  test("maps a raw carousel API error to a channel error", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 13_100,
            message: "Invalid carousel",
            type: "OAuthException",
          },
        }),
        { status: 400 },
      ),
    )

    await expect(
      sendCards([
        makeCard({
          id: "card-1",
          imageUrl: IMAGE_URL,
          buttons: [makeButton("1000000000003", "Choose")],
        }),
        makeCard({
          id: "card-2",
          imageUrl: IMAGE_URL,
          buttons: [makeButton("1000000000005", "Choose")],
        }),
      ]),
    ).rejects.toBeDefined()
    expect(mockLogger.error).toHaveBeenCalled()
  })

  test("keeps approved template messages on the shared raw transport", async () => {
    const result = await sendTemplate()

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockApiFetch).toHaveBeenCalledOnce()
    const request = mockApiFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(request.body as string)).toMatchObject({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: contact.sourceId,
      type: "template",
      template: {
        name: "order_update",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "Order 123" }],
          },
        ],
      },
    })
    expect(result).toEqual({ messageIds: ["wamid.raw-1"] })
  })

  test.each([
    ["carousel", () => sendCards([makeCard(), makeCard()])],
    ["template", sendTemplate],
  ])("accepts a minimal forward-compatible raw response for %s", async (_messageType, sendRawMessage) => {
    mockApiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: "wamid.forward-compatible",
              message_status: "a_future_status",
              provider_extension: true,
            },
          ],
          provider_extension: { version: 2 },
        }),
        { status: 200 },
      ),
    )

    await expect(sendRawMessage()).resolves.toEqual({
      messageIds: ["wamid.forward-compatible"],
    })
  })

  test("warns instead of failing when a raw response carries no message id", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{}] }), { status: 200 }),
    )

    await expect(sendCards([makeCard(), makeCard()])).resolves.toEqual({
      messageIds: [],
    })
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  test("drops reply buttons that repeat an earlier label", async () => {
    await sendCards(
      [makeCard({ buttons: [makeButton("1000000000003", "Yes")] })],
      [makeQuickReply("1000000000004", "Yes")],
    )

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(sentMessages()[0].action).toMatchObject({
      buttons: [
        { reply: { id: `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000003` } },
      ],
    })
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  test("keeps the image inline while three replies still fit", async () => {
    await sendCards(
      [
        makeCard({
          imageUrl: IMAGE_URL,
          buttons: [
            makeButton("1000000000003", "One"),
            makeButton("1000000000005", "Two"),
          ],
        }),
      ],
      [makeQuickReply("1000000000004", "Three")],
    )

    expect(mockSendMessage).toHaveBeenCalledOnce()
    const [message] = sentMessages()
    expect(message).toMatchObject({
      type: "button",
      header: { type: "image", image: { link: IMAGE_URL } },
    })
    expect(message.action).toMatchObject({
      buttons: [
        { reply: { title: "One" } },
        { reply: { title: "Two" } },
        { reply: { title: "Three" } },
      ],
    })
  })

  test("sends the image separately rather than dropping a fourth reply", async () => {
    await sendCards(
      [
        makeCard({
          imageUrl: IMAGE_URL,
          buttons: [
            makeButton("1000000000003", "One"),
            makeButton("1000000000005", "Two"),
            makeButton("1000000000006", "Three"),
          ],
        }),
      ],
      [makeQuickReply("1000000000004", "Four")],
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    const [image, list] = sentMessages()
    expect(image).toMatchObject({ _type: "image", link: IMAGE_URL })
    expect(list).toMatchObject({ _type: "interactive", type: "list" })
    expect(list.action).toMatchObject({
      sections: [
        {
          rows: [
            { title: "One" },
            { title: "Two" },
            { title: "Three" },
            { title: "Four" },
          ],
        },
      ],
    })
  })

  test("spreads more replies than one list holds across extra messages", async () => {
    await sendCards(
      [
        makeCard({
          buttons: [
            makeButton("1000000000003", "One"),
            makeButton("1000000000005", "Two"),
            makeButton("1000000000006", "Three"),
          ],
        }),
      ],
      Array.from({ length: 10 }, (_, index) =>
        makeQuickReply(`${1_000_000_000_020 + index}`, `Quick ${index}`),
      ),
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    const [first, second] = sentMessages()
    const rowsOf = (message: Record<string, unknown>) =>
      (message.action as { sections: { rows: { title: string }[] }[] })
        .sections[0].rows

    expect(rowsOf(first)).toHaveLength(10)
    expect(rowsOf(second).map((row) => row.title)).toEqual([
      "Quick 7",
      "Quick 8",
      "Quick 9",
    ])
    // Every message keeps the card title so each list stands on its own.
    expect(second).toMatchObject({ body: { text: "Card title" } })
  })

  test("falls back to a list layout when an image-less card has more than three replies", async () => {
    await sendCards(
      [
        makeCard({
          buttons: [
            makeButton("1000000000003", "One"),
            makeButton("1000000000005", "Two"),
            makeButton("1000000000006", "Three"),
          ],
        }),
      ],
      [makeQuickReply("1000000000004", "Four")],
    )

    expect(mockSendMessage).toHaveBeenCalledOnce()
    const [message] = sentMessages()
    expect(message).toMatchObject({ type: "list" })
    expect(message.action).toMatchObject({
      sections: [
        {
          rows: [
            { title: "One" },
            { title: "Two" },
            { title: "Three" },
            { title: "Four" },
          ],
        },
      ],
    })
  })

  test("promotes the subtitle to the body when the title resolves empty", async () => {
    await sendCards(
      [makeCard({ title: "   ", subtitle: "Only subtitle" })],
      [makeQuickReply("1000000000004", "Later")],
    )

    expect(mockSendMessage).toHaveBeenCalledOnce()
    const [message] = sentMessages()
    expect(message).toMatchObject({ body: { text: "Only subtitle" } })
    expect(message.footer).toBeUndefined()
  })

  test("leads with a text message when the body outgrows one interactive", async () => {
    await sendCards([
      makeCard({
        title: `${"T".repeat(1020)} tail`,
        subtitle: "S".repeat(120),
        buttons: [makeButton("1000000000003", "L".repeat(40))],
      }),
    ])

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    const [overflow, message] = sentMessages()

    expect(overflow).toMatchObject({ _type: "text", body: "T".repeat(1020) })
    expect(message).toMatchObject({
      _type: "interactive",
      body: { text: "tail" },
    })
    // A footer and a button title have nowhere to overflow to, so they clamp.
    expect((message.footer as { text: string }).text).toHaveLength(60)
    expect(message.action).toMatchObject({
      buttons: [{ reply: { title: "L".repeat(20) } }],
    })
  })

  test("skips a card that has no title, no subtitle and no image", async () => {
    await sendCards([makeCard({ title: "", subtitle: "" })])

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  test("drops a blank-labelled button instead of throwing", async () => {
    await sendCards([
      makeCard({
        buttons: [
          makeButton("1000000000003", "  "),
          makeButton("1000000000005", "Keep"),
        ],
      }),
    ])

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(sentMessages()[0].action).toMatchObject({
      buttons: [{ reply: { title: "Keep" } }],
    })
  })

  test("drops a quick reply that repeats a card button id", async () => {
    await sendCards(
      [makeCard({ buttons: [makeButton("1000000000003", "Card")] })],
      [
        {
          id: "1000000000003",
          label: "Quick",
          buttonType: "postback",
          postback: `${FLOW_ID}:${FLOW_VERSION_ID}:1000000000003`,
        },
      ],
    )

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(sentMessages()[0].action).toMatchObject({
      buttons: [{ reply: { title: "Card" } }],
    })
  })

  test("falls back to the card text when every reply is unusable", async () => {
    await sendCards([
      makeCard({ buttons: [makeButton("1000000000003", "   ")] }),
    ])

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(sentMessages()[0]).toMatchObject({
      _type: "text",
      body: "Card title\nCard subtitle",
    })
  })

  test("keeps the image when every reply of an image card is unusable", async () => {
    await sendCards([
      makeCard({
        imageUrl: IMAGE_URL,
        buttons: [makeButton("1000000000003", "")],
      }),
    ])

    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(sentMessages()[0]).toMatchObject({
      _type: "image",
      link: IMAGE_URL,
      caption: "Card title\nCard subtitle",
    })
  })

  test("trails the image with the caption text that did not fit", async () => {
    await sendCards([
      makeCard({
        imageUrl: IMAGE_URL,
        title: "T".repeat(700),
        subtitle: "S".repeat(700),
      }),
    ])

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    const [image, overflow] = sentMessages()
    expect(image).toMatchObject({
      _type: "image",
      link: IMAGE_URL,
      caption: "T".repeat(700),
    })
    expect(overflow).toMatchObject({ _type: "text", body: "S".repeat(700) })
  })
})
