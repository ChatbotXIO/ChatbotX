import {
  type ButtonStepProps,
  CHANNEL_FLOW_POLICIES,
  decodeButtonPayload,
  encodeButtonPayload,
  type SendCardStepSchema,
  type SendCarouselStepSchema,
} from "@chatbotx.io/flow-config"
import type {
  MessageButtonTemplate,
  OutgoingAttachment,
} from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { LINE_NOOP_POSTBACK_DATA } from "../src/handlers/message/incoming-message"
import { toLineAction } from "../src/handlers/message/outgoing-message/actions"
import type {
  FlexBubble,
  FlexButton,
  FlexCarousel,
  FlexMessage,
  FlexText,
} from "../src/handlers/message/outgoing-message/flex"
import {
  LINE_LIMITS,
  truncate,
} from "../src/handlers/message/outgoing-message/limits"
import {
  AUDIO_DURATION_FALLBACK_MS,
  attachmentMessages,
  convertFlowStepGif,
  convertFlowStepMedia,
  convertFlowStepMultipleImages,
} from "../src/handlers/message/outgoing-message/send-attachment"
import {
  convertFlowStepCard,
  convertFlowStepCarousel,
} from "../src/handlers/message/outgoing-message/send-card"
import {
  convertFlowStepQuickReply,
  toQuickReplyActions,
  withQuickReplies,
} from "../src/handlers/message/outgoing-message/send-quick-reply"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const FLOW_ID = "100"
const URL = "https://cdn.example.com/a.png"

const postbackButton = (id: string, label = `Btn ${id}`) =>
  ({
    id,
    label,
    buttonType: "startAnotherNode",
    beforeStep: { id: "1", stepType: "startAnotherNode", nodeId: "n" },
    steps: [],
  }) as unknown as ButtonStepProps

const websiteButton = (id: string) =>
  ({
    id,
    label: "Site",
    buttonType: "openWebsite",
    beforeStep: { id: "1", stepType: "openWebsite", url: "https://x.io" },
    steps: [],
  }) as unknown as ButtonStepProps

const phoneButton = (id: string) =>
  ({
    id,
    label: "Call",
    buttonType: "callPhoneNumber",
    beforeStep: {
      id: "1",
      stepType: "callPhoneNumber",
      phoneNumber: "+1 (415) 555-2671",
    },
    steps: [],
  }) as unknown as ButtonStepProps

const buttons = (n: number) =>
  Array.from({ length: n }, (_, i) => postbackButton(String(i + 1)))

const card = (
  n: number,
  extra: Partial<SendCardStepSchema> = {},
): SendCardStepSchema =>
  ({
    id: `card-${n}`,
    stepType: "sendCard",
    title: `Card ${n}`,
    subtitle: `Sub ${n}`,
    image: {
      id: "i",
      stepType: "sendImage",
      mode: "file",
      url: URL,
      buttons: [],
    },
    buttons: buttons(n),
    ...extra,
  }) as SendCardStepSchema

const carousel = (cards: SendCardStepSchema[]) =>
  ({
    id: "c",
    stepType: "sendCarousel",
    layout: "horizontal",
    cards,
  }) as SendCarouselStepSchema

const encoder = new TextEncoder()
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length

const asFlex = (message: unknown) => message as FlexMessage
const bubbleOf = (message: unknown) => asFlex(message).contents as FlexBubble
const carouselOf = (message: unknown) =>
  asFlex(message).contents as FlexCarousel
const bodyTexts = (bubble: FlexBubble) =>
  (bubble.body?.contents ?? []).map((text) => text.text as string)
const footerButtons = (bubble: FlexBubble) => bubble.footer?.contents ?? []

const longUriButton = (id: string, length: number) =>
  ({
    id,
    label: `Link ${id}`,
    buttonType: "openWebsite",
    beforeStep: {
      id: "1",
      stepType: "openWebsite",
      url: `https://x.io/${"p".repeat(length)}`,
    },
    steps: [],
  }) as unknown as ButtonStepProps

describe("toLineAction", () => {
  test("flow postback-like button → postback with encoded payload", () => {
    expect(
      toLineAction({ flowId: FLOW_ID, button: postbackButton("7", "Yes") }),
    ).toEqual({
      type: "postback",
      label: "Yes",
      data: encodeButtonPayload({ flowId: FLOW_ID, buttonId: "7" }),
      displayText: "Yes",
    })
  })

  test("openWebsite → uri", () => {
    expect(
      toLineAction({ flowId: FLOW_ID, button: websiteButton("1") }),
    ).toEqual({ type: "uri", label: "Site", uri: "https://x.io" })
  })

  test("callPhoneNumber → tel: uri in E.164", () => {
    expect(toLineAction({ flowId: FLOW_ID, button: phoneButton("1") })).toEqual(
      {
        type: "uri",
        label: "Call",
        uri: "tel:+14155552671",
      },
    )
  })

  test("unsupported flow button types → null", () => {
    const optionList = {
      ...postbackButton("1"),
      buttonType: "whatsappOptionList",
      beforeStep: null,
    } as unknown as ButtonStepProps
    expect(toLineAction({ flowId: FLOW_ID, button: optionList })).toBeNull()
  })

  test("canonical template buttons", () => {
    const url: MessageButtonTemplate = {
      id: "1",
      label: "Open",
      buttonType: "url",
      url: "https://x.io",
    }
    const phone: MessageButtonTemplate = {
      id: "2",
      label: "Call",
      buttonType: "phoneNumber",
      phoneNumber: "+14155552671",
      postback: "pb-phone",
    }
    const postback: MessageButtonTemplate = {
      id: "3",
      label: "Go",
      buttonType: "postback",
      postback: "pb-go",
    }
    expect(toLineAction(url)).toEqual({
      type: "uri",
      label: "Open",
      uri: "https://x.io",
    })
    expect(toLineAction(phone)).toEqual({
      type: "uri",
      label: "Call",
      uri: "tel:+14155552671",
    })
    expect(toLineAction(postback)).toEqual({
      type: "postback",
      label: "Go",
      data: "pb-go",
      displayText: "Go",
    })
  })

  test("labels are cut to 20 characters", () => {
    const action = toLineAction({
      flowId: FLOW_ID,
      button: postbackButton("1", "x".repeat(25)),
    })
    expect(Array.from(action?.label ?? "")).toHaveLength(20)
  })
})

describe("sendText", () => {
  const textStep = (text: string, n = 0) =>
    ({ id: "s", stepType: "sendText", text, buttons: buttons(n) }) as const

  test("without buttons → one text message", () => {
    expect(convertFlowStepText(textStep("hello"), FLOW_ID)).toEqual([
      { type: "text", text: "hello" },
    ])
  })

  test("text over the text limit splits into several text messages", () => {
    const messages = convertFlowStepText(
      textStep("a".repeat(LINE_LIMITS.textMessage + 1)),
      FLOW_ID,
    )
    expect(messages.map((m) => (m.text as string).length)).toEqual([
      LINE_LIMITS.textMessage,
      1,
    ])
  })

  test("text split never cuts an emoji (surrogate pair) in half", () => {
    // An emoji straddling the limit moves whole into the next message.
    const head = "a".repeat(LINE_LIMITS.textMessage - 1)
    const messages = convertFlowStepText(textStep(`${head}😀b`), FLOW_ID)
    expect(messages.map((m) => m.text)).toEqual([head, "😀b"])
  })

  test("text length is counted in UTF-16 units (emoji count as 2)", () => {
    const emojis = LINE_LIMITS.textMessage / 2 + 1
    const messages = convertFlowStepText(textStep("😀".repeat(emojis)), FLOW_ID)
    expect(messages.map((m) => (m.text as string).length)).toEqual([
      LINE_LIMITS.textMessage,
      2,
    ])
  })

  test("truncate counts UTF-16 units and never splits a surrogate pair", () => {
    expect(truncate("abc😀def", 5)).toBe("abc…")
    expect(truncate("abcd😀", 5)).toBe("abcd…")
    expect(truncate("ab", 5)).toBe("ab")
  })

  test("with buttons → one flex bubble: the text, then link-style buttons", () => {
    const messages = convertFlowStepText(textStep("Pick one", 2), FLOW_ID)
    expect(messages).toEqual([
      {
        type: "flex",
        altText: "Pick one",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [{ type: "text", text: "Pick one", wrap: true }],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [1, 2].map((i) => ({
              type: "button",
              style: "link",
              action: {
                type: "postback",
                label: `Btn ${i}`,
                data: encodeButtonPayload({
                  flowId: FLOW_ID,
                  buttonId: String(i),
                }),
                displayText: `Btn ${i}`,
              },
            })),
          },
        },
      },
    ])
  })

  test("long text with buttons is one message holding the full text (no follow-up)", () => {
    const text = "w".repeat(4000)
    const messages = convertFlowStepText(textStep(text, 2), FLOW_ID)
    expect(messages).toHaveLength(1)
    const bubble = bubbleOf(messages[0])
    expect(bodyTexts(bubble)).toEqual([text])
    expect(footerButtons(bubble)).toHaveLength(2)
  })

  test("altText is cut to the alt text limit", () => {
    const text = "z".repeat(LINE_LIMITS.altText + 100)
    const [message] = convertFlowStepText(textStep(text, 1), FLOW_ID)
    const { altText } = asFlex(message)
    expect(altText).toHaveLength(LINE_LIMITS.altText)
    expect(altText.endsWith("…")).toBe(true)
    expect(bodyTexts(bubbleOf(message))).toEqual([text])
  })

  test("buttons beyond the LINE button count are capped", () => {
    const [message] = convertFlowStepText(
      textStep("hi", LINE_LIMITS.stepButtons + 2),
      FLOW_ID,
    )
    expect(footerButtons(bubbleOf(message))).toHaveLength(
      LINE_LIMITS.stepButtons,
    )
  })

  test("blank text with buttons → no empty text component, buttons only", () => {
    const [message] = convertFlowStepText(textStep("", 1), FLOW_ID)
    const bubble = bubbleOf(message)
    expect("body" in bubble).toBe(false)
    expect(footerButtons(bubble)).toHaveLength(1)
    expect(asFlex(message).altText).toBe("Btn 1")
  })

  test("text too large for one bubble is cut by size across bubbles; nothing lost", () => {
    // Control characters are escaped as \u00XX (6 bytes each) in JSON.
    const text = "\u0001".repeat(LINE_LIMITS.textMessage + 1000)
    const messages = convertFlowStepText(textStep(text, 2), FLOW_ID)
    const bubbles = messages.flatMap((m) => carouselOf(m).contents)
    for (const bubble of bubbles) {
      expect(bytes(bubble)).toBeLessThanOrEqual(LINE_LIMITS.bubbleBytes)
    }
    const textBubbles = bubbles.filter((b) => !b.footer)
    expect(textBubbles.flatMap(bodyTexts).join("")).toBe(text)
    expect(bubbles.flatMap(footerButtons).map((b) => b.action.label)).toEqual([
      "Btn 1",
      "Btn 2",
    ])
  })
})

const cardStep = () => card(2)

describe("sendCard", () => {
  test("→ one bubble: hero image, full 80-char title and subtitle, buttons", () => {
    const title = "T".repeat(80)
    const subtitle = "S".repeat(80)
    const messages = convertFlowStepCard(
      { ...cardStep(), title, subtitle },
      FLOW_ID,
    )
    expect(messages).toHaveLength(1)
    const bubble = bubbleOf(messages[0])
    expect(bubble.hero).toEqual({
      type: "image",
      url: URL,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    })
    expect(bubble.body?.contents).toEqual([
      { type: "text", text: title, wrap: true, weight: "bold", size: "md" },
      { type: "text", text: subtitle, wrap: true, size: "sm" },
    ])
    expect(footerButtons(bubble).map((b) => [b.style, b.action.label])).toEqual(
      [
        ["link", "Btn 1"],
        ["link", "Btn 2"],
      ],
    )
    expect(asFlex(messages[0]).altText).toBe(title)
  })

  test("0 buttons → still one bubble, without a footer", () => {
    const messages = convertFlowStepCard(card(0), FLOW_ID)
    expect(messages).toHaveLength(1)
    const bubble = bubbleOf(messages[0])
    expect(bubble.hero?.url).toBe(URL)
    expect(bodyTexts(bubble)).toEqual(["Card 0", "Sub 0"])
    expect("footer" in bubble).toBe(false)
  })

  test("empty subtitle → omitted, never sent as an empty text", () => {
    const [message] = convertFlowStepCard(
      { ...cardStep(), subtitle: "" },
      FLOW_ID,
    )
    expect(bodyTexts(bubbleOf(message))).toEqual(["Card 2"])
  })

  test("empty title and subtitle → no body; altText falls back to the labels", () => {
    const [message] = convertFlowStepCard(
      card(2, { title: "", subtitle: "" }),
      FLOW_ID,
    )
    const bubble = bubbleOf(message)
    expect("body" in bubble).toBe(false)
    expect(bubble.hero?.url).toBe(URL)
    expect(asFlex(message).altText).toBe("Btn 1 / Btn 2")
  })

  test("no image, text or button → no message at all (never an empty bubble)", () => {
    expect(
      convertFlowStepCard(
        card(0, { title: "", subtitle: "", image: undefined }),
        FLOW_ID,
      ),
    ).toEqual([])
  })

  test("over the bubble budget → leading buttons stay, the rest follow in their own bubbles", () => {
    const step = card(0, {
      buttons: ["1", "2", "3"].map((id) => longUriButton(id, 10_000)),
    })
    const messages = convertFlowStepCard(step, FLOW_ID)
    expect(messages).toHaveLength(1)
    const bubbles = carouselOf(messages[0]).contents
    for (const bubble of bubbles) {
      expect(bytes(bubble)).toBeLessThanOrEqual(LINE_LIMITS.bubbleBytes)
    }
    expect(bubbles[0]?.hero?.url).toBe(URL)
    expect(bodyTexts(bubbles[0] as FlexBubble)).toEqual(["Card 0", "Sub 0"])
    expect(bubbles.flatMap(footerButtons).map((b) => b.action.label)).toEqual([
      "Link 1",
      "Link 2",
      "Link 3",
    ])
    const last = bubbles.at(-1) as FlexBubble
    expect(bodyTexts(last)).toEqual(["Link 3"])
  })
})

describe("sendCarousel", () => {
  test("each bubble carries exactly its own buttons; no padding", () => {
    const [message, ...rest] = convertFlowStepCarousel(
      carousel([card(1), card(3), card(0)]),
      FLOW_ID,
    )
    expect(rest).toEqual([])
    const bubbles = carouselOf(message).contents
    expect(bubbles.map((b) => footerButtons(b).length)).toEqual([1, 3, 0])
    expect("footer" in (bubbles[2] as FlexBubble)).toBe(false)
    expect(JSON.stringify(message)).not.toContain(LINE_NOOP_POSTBACK_DATA)
  })

  test("each bubble keeps its own image and title", () => {
    const [message] = convertFlowStepCarousel(
      carousel([
        card(1),
        card(1, { image: undefined }),
        card(1, { title: "" }),
      ]),
      FLOW_ID,
    )
    const bubbles = carouselOf(message).contents
    expect(bubbles.map((b) => b.hero?.url)).toEqual([URL, undefined, URL])
    expect(bubbles.map(bodyTexts)).toEqual([
      ["Card 1", "Sub 1"],
      ["Card 1", "Sub 1"],
      ["Sub 1"],
    ])
  })

  test("buttonless cards stay bubbles in the carousel", () => {
    const [message] = convertFlowStepCarousel(
      carousel([card(0), card(0, { image: undefined, subtitle: "" })]),
      FLOW_ID,
    )
    const bubbles = carouselOf(message).contents
    expect(bubbles.map(bodyTexts)).toEqual([["Card 0", "Sub 0"], ["Card 0"]])
    expect(bubbles.every((b) => !b.footer)).toBe(true)
  })

  test(`keeps ${LINE_LIMITS.carouselBubbles} bubbles in one carousel`, () => {
    const cards = Array.from({ length: LINE_LIMITS.carouselBubbles }, (_, i) =>
      card(1, { title: `Card ${i}` }),
    )
    const messages = convertFlowStepCarousel(carousel(cards), FLOW_ID)
    expect(messages).toHaveLength(1)
    expect(carouselOf(messages[0]).contents).toHaveLength(
      LINE_LIMITS.carouselBubbles,
    )
  })

  test("more cards than a carousel holds continue in a second carousel, in order", () => {
    const count = LINE_LIMITS.carouselBubbles + 1
    const cards = Array.from({ length: count }, (_, i) =>
      card(1, { title: `Card ${i}` }),
    )
    const messages = convertFlowStepCarousel(carousel(cards), FLOW_ID)
    expect(messages.map((m) => carouselOf(m).contents.length)).toEqual([
      LINE_LIMITS.carouselBubbles,
      1,
    ])
    const titles = messages.flatMap((m) =>
      carouselOf(m).contents.map((b) => bodyTexts(b)[0]),
    )
    expect(titles).toEqual(cards.map((c) => c.title))
  })

  test("over the carousel size budget → split into several carousels, in order, nothing dropped", () => {
    const cards = Array.from({ length: 6 }, (_, i) =>
      card(0, {
        title: `Card ${i}`,
        buttons: [longUriButton(`${i}`, 9000)],
      }),
    )
    const messages = convertFlowStepCarousel(carousel(cards), FLOW_ID)
    expect(messages.length).toBeGreaterThan(1)
    for (const message of messages) {
      expect(bytes(asFlex(message).contents)).toBeLessThanOrEqual(
        LINE_LIMITS.carouselBytes,
      )
    }
    const bubbles = messages.flatMap((m) => carouselOf(m).contents)
    expect(bubbles.map((b) => bodyTexts(b)[0])).toEqual(
      cards.map((c) => c.title),
    )
    expect(bubbles.flatMap(footerButtons)).toHaveLength(cards.length)
  })

  test("altText is the card titles", () => {
    const [message] = convertFlowStepCarousel(
      carousel([card(1), card(2)]),
      FLOW_ID,
    )
    expect(asFlex(message).altText).toBe("Card 1, Card 2")
  })
})

describe("flex payload types", () => {
  // Compile-time guards (checked by tsc; at runtime they only build objects).
  test("an unstyled button, a plain-string text or an empty bubble does not type-check", () => {
    const action = { type: "uri", label: "a", uri: "https://x.io" } as const
    // @ts-expect-error a button must name its style
    const unstyled: FlexButton = { type: "button", action }
    // @ts-expect-error text must come from the builder (non-empty brand)
    const plain: FlexText = { type: "text", text: "", wrap: true }
    // @ts-expect-error a bubble needs a hero, body or footer
    const empty: FlexBubble = { type: "bubble" }
    expect([unstyled, plain, empty]).toHaveLength(3)
  })
})

describe("sendQuickReply", () => {
  test("14 items → 13 postback quick replies on the last message", () => {
    const messages = convertFlowStepQuickReply(
      {
        id: "q",
        stepType: "sendQuickReply",
        message: "Pick one",
        buttons: buttons(14),
      },
      FLOW_ID,
    )
    expect(messages).toHaveLength(1)
    const last = messages.at(-1) as {
      text: string
      quickReply: {
        items: Array<{ type: string; action: Record<string, string> }>
      }
    }
    expect(last.text).toBe("Pick one")
    expect(last.quickReply.items).toHaveLength(13)
    expect(last.quickReply.items[0]).toEqual({
      type: "action",
      action: {
        type: "postback",
        label: "Btn 1",
        data: encodeButtonPayload({ flowId: FLOW_ID, buttonId: "1" }),
        displayText: "Btn 1",
      },
    })
    expect(
      decodeButtonPayload(last.quickReply.items[0]?.action.data ?? "").buttonId,
    ).toBe("1")
  })

  test("canonical url quick reply → uri action (kept, not dropped)", () => {
    expect(
      toQuickReplyActions([
        {
          id: "1",
          label: "Open",
          buttonType: "url",
          url: "https://x.io",
        },
      ]),
    ).toEqual([{ type: "uri", label: "Open", uri: "https://x.io" }])
  })

  test("canonical postback quick reply → postback, never a message action", () => {
    expect(
      toQuickReplyActions([
        {
          id: "1",
          label: "Go",
          buttonType: "postback",
          postback: "pb-go",
        },
      ]),
    ).toEqual([
      {
        type: "postback",
        label: "Go",
        data: "pb-go",
        displayText: "Go",
      },
    ])
  })

  test("canonical phoneNumber quick reply → tel: uri", () => {
    expect(
      toQuickReplyActions([
        {
          id: "1",
          label: "Call",
          buttonType: "phoneNumber",
          phoneNumber: "+14155552671",
          postback: "pb",
        },
      ]),
    ).toEqual([{ type: "uri", label: "Call", uri: "tel:+14155552671" }])
  })

  test("canonical copyText quick reply → postback; unrenderable flow button dropped", () => {
    const optionList = {
      ...postbackButton("2"),
      buttonType: "whatsappOptionList",
      beforeStep: null,
    } as unknown as ButtonStepProps
    expect(
      toQuickReplyActions([
        {
          id: "1",
          label: "Copy",
          buttonType: "copyText",
          copyText: "CODE42",
          postback: "pb-copy",
        },
        { flowId: FLOW_ID, button: optionList },
      ]),
    ).toEqual([
      {
        type: "postback",
        label: "Copy",
        data: "pb-copy",
        displayText: "Copy",
      },
    ])
  })

  test("flow openWebsite / callPhoneNumber quick replies → uri actions", () => {
    expect(
      toQuickReplyActions([
        { flowId: FLOW_ID, button: websiteButton("1") },
        { flowId: FLOW_ID, button: phoneButton("2") },
      ]),
    ).toEqual([
      { type: "uri", label: "Site", uri: "https://x.io" },
      { type: "uri", label: "Call", uri: "tel:+14155552671" },
    ])
  })

  test("withQuickReplies attaches to the last message only", () => {
    const actions = toQuickReplyActions([
      {
        id: "1",
        label: "Go",
        buttonType: "postback",
        postback: "pb",
      },
    ])
    const messages = withQuickReplies(
      [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
      actions,
    )
    expect(messages[0]).toEqual({ type: "text", text: "a" })
    expect(messages[1]).toMatchObject({
      quickReply: { items: [{ type: "action" }] },
    })
  })
})

describe("media steps", () => {
  const media = <T extends string>(stepType: T, n = 0) =>
    ({
      id: "m",
      stepType,
      mode: "file",
      url: URL,
      buttons: buttons(n),
    }) as const

  test("sendImage → image with the same preview URL", () => {
    expect(convertFlowStepMedia(media("sendImage"), FLOW_ID)).toEqual([
      { type: "image", originalContentUrl: URL, previewImageUrl: URL },
    ])
  })

  test("sendVideo → video", () => {
    expect(convertFlowStepMedia(media("sendVideo"), FLOW_ID)).toEqual([
      { type: "video", originalContentUrl: URL, previewImageUrl: URL },
    ])
  })

  test("sendAudio → audio with the fallback duration", () => {
    expect(AUDIO_DURATION_FALLBACK_MS).toBe(60_000)
    expect(convertFlowStepMedia(media("sendAudio"), FLOW_ID)).toEqual([
      { type: "audio", originalContentUrl: URL, duration: 60_000 },
    ])
  })

  test("sendFile → text with the file URL (D11)", () => {
    expect(convertFlowStepMedia(media("sendFile"), FLOW_ID)).toEqual([
      { type: "text", text: URL },
    ])
  })

  test("media with buttons → media, then a flex bubble: labels, then the buttons", () => {
    const messages = convertFlowStepMedia(media("sendImage", 2), FLOW_ID)
    expect(messages).toHaveLength(2)
    expect(messages[0]?.type).toBe("image")
    const bubble = bubbleOf(messages[1])
    expect(bodyTexts(bubble)).toEqual(["Btn 1 / Btn 2"])
    expect(footerButtons(bubble).map((b) => b.style)).toEqual(["link", "link"])
    expect(asFlex(messages[1]).altText).toBe("Btn 1 / Btn 2")
  })

  test("sendGif → text with the URL (LINE images are JPEG/PNG only)", () => {
    expect(
      convertFlowStepGif({ id: "g", stepType: "sendGif", url: URL }),
    ).toEqual([{ type: "text", text: URL }])
  })

  test("sendMultipleImages → one image per item", () => {
    const messages = convertFlowStepMultipleImages({
      id: "mi",
      stepType: "sendMultipleImages",
      images: [
        { id: "1", mode: "file", url: `${URL}?1` },
        { id: "2", mode: "file", url: `${URL}?2` },
        { id: "3", mode: "file", url: `${URL}?3` },
      ],
    })
    expect(messages.map((m) => [m.type, m.originalContentUrl])).toEqual([
      ["image", `${URL}?1`],
      ["image", `${URL}?2`],
      ["image", `${URL}?3`],
    ])
  })
})

describe("attachmentMessages (inbox / agent)", () => {
  const attachment = (fileType: OutgoingAttachment["fileType"]) =>
    ({
      fileType,
      mimeType: "x/y",
      originPath: "p",
      size: 1,
      url: URL,
    }) satisfies OutgoingAttachment

  test("maps each file type", () => {
    expect(attachmentMessages(attachment("image"))).toEqual([
      { type: "image", originalContentUrl: URL, previewImageUrl: URL },
    ])
    expect(attachmentMessages(attachment("video"))[0]?.type).toBe("video")
    expect(attachmentMessages(attachment("audio"))[0]).toMatchObject({
      type: "audio",
      duration: 60_000,
    })
    expect(attachmentMessages(attachment("file"))).toEqual([
      { type: "text", text: URL },
    ])
  })
})

describe("five buttons and per-button styles", () => {
  const styled = (
    button: ButtonStepProps,
    style: ButtonStepProps["style"],
  ): ButtonStepProps => ({ ...button, style })
  const styles = (bubble: FlexBubble) =>
    footerButtons(bubble).map((button) => button.style)

  test("the LINE policy's 5 buttons are what is rendered", () => {
    expect(LINE_LIMITS.stepButtons).toBe(5)
    expect(LINE_LIMITS.cardButtons).toBe(5)
  })

  test("step and card limits each follow their own policy value", () => {
    const { limits } = CHANNEL_FLOW_POLICIES.line
    expect(LINE_LIMITS.stepButtons).toBe(limits.buttonCount)
    expect(LINE_LIMITS.cardButtons).toBe(limits.cardButtonCount)
  })

  test("card buttons beyond the card limit are capped", () => {
    const [message] = convertFlowStepCard(
      card(LINE_LIMITS.cardButtons + 2),
      FLOW_ID,
    )
    expect(footerButtons(bubbleOf(message))).toHaveLength(
      LINE_LIMITS.cardButtons,
    )
  })

  test("carousel card buttons beyond the card limit are capped", () => {
    const messages = convertFlowStepCarousel(
      carousel([card(LINE_LIMITS.cardButtons + 2), card(1)]),
      FLOW_ID,
    )
    const bubbles = messages.flatMap((message) => carouselOf(message).contents)
    expect(bubbles.map((bubble) => footerButtons(bubble).length)).toEqual([
      LINE_LIMITS.cardButtons,
      1,
    ])
  })

  test("text: 5 buttons, each with its own style; unset → link", () => {
    const [message] = convertFlowStepText(
      {
        text: "Pick",
        buttons: [
          styled(postbackButton("1"), "primary"),
          styled(websiteButton("2"), "secondary"),
          styled(phoneButton("3"), "link"),
          postbackButton("4"),
          styled(postbackButton("5"), "primary"),
        ],
      },
      FLOW_ID,
    )
    expect(styles(bubbleOf(message))).toEqual([
      "primary",
      "secondary",
      "link",
      "link",
      "primary",
    ])
  })

  test("a style survives a dropped (unrenderable) button before it", () => {
    const miniApp = {
      ...postbackButton("0"),
      buttonType: "openMiniApp",
    } as unknown as ButtonStepProps
    const [message] = convertFlowStepText(
      {
        text: "Pick",
        buttons: [miniApp, styled(postbackButton("1"), "primary")],
      },
      FLOW_ID,
    )
    expect(styles(bubbleOf(message))).toEqual(["primary"])
  })

  test("card: 5 buttons with their styles", () => {
    const [message] = convertFlowStepCard(
      card(5, {
        buttons: buttons(5).map((button, index) =>
          index < 2 ? styled(button, "secondary") : button,
        ),
      }),
      FLOW_ID,
    )
    expect(styles(bubbleOf(message))).toEqual([
      "secondary",
      "secondary",
      "link",
      "link",
      "link",
    ])
  })

  test("carousel: each card keeps its 5 buttons and their styles", () => {
    const [message] = convertFlowStepCarousel(
      carousel([
        card(5),
        card(5, {
          buttons: buttons(5).map((button) => styled(button, "primary")),
        }),
      ]),
      FLOW_ID,
    )
    const [first, second] = carouselOf(message).contents
    expect(first && styles(first)).toEqual(new Array(5).fill("link"))
    expect(second && styles(second)).toEqual(new Array(5).fill("primary"))
  })

  test("media follow-up: 5 buttons with their styles", () => {
    const messages = convertFlowStepMedia(
      {
        id: "m",
        stepType: "sendImage",
        mode: "file",
        url: URL,
        buttons: [styled(postbackButton("1"), "primary"), ...buttons(4)],
      } as never,
      FLOW_ID,
    )
    expect(styles(bubbleOf(messages.at(-1)))).toEqual([
      "primary",
      "link",
      "link",
      "link",
      "link",
    ])
  })
})
