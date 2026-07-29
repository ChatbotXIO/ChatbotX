import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetWhatsappClient, mockSendMessage, mockLogger } = vi.hoisted(
  () => {
    const sendMessage = vi.fn()
    return {
      mockGetWhatsappClient: vi.fn(() => ({ sendMessage })),
      mockSendMessage: sendMessage,
      mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }
  },
)

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

const contact = {
  id: "contact-1",
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

const sentMessages = () =>
  mockSendMessage.mock.calls.map((call) => call[2] as Record<string, unknown>)

describe("whatsapp outgoing card", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  test("sends one message per card and attaches quick replies to the last card only", async () => {
    await sendCards(
      [
        makeCard({ id: "card-1", title: "First", imageUrl: IMAGE_URL }),
        makeCard({ id: "card-2", title: "Second" }),
      ],
      [makeQuickReply("1000000000004", "Later")],
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    const [first, second] = sentMessages()
    expect(first).toMatchObject({ _type: "image", link: IMAGE_URL })
    expect(second).toMatchObject({
      _type: "interactive",
      body: { text: "Second" },
    })
    expect(second.action).toMatchObject({
      buttons: [{ reply: { title: "Later" } }],
    })
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
