import {
  buttonStepDefaultFn,
  getUserDataStepDefaultFn,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendGifStepDefaultFn,
  sendImageStepDefaultFn,
  sendMessageNodeDefaultFn,
  sendMultipleImagesStepDefaultFn,
  sendTextStepDefaultFn,
  startAnotherNodeStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertStartNodeToMessengerAdsJson } from "../src/messenger-ads-json"

const FLOW_ID = "1756191592047"
const FLOW_VERSION_ID = "1782439145669"

function makeStartNode(steps: any[], quickReplies: any[] = []) {
  const node = sendMessageNodeDefaultFn({ dataProps: { isStartNode: true } })
  return {
    ...node,
    data: {
      ...node.data,
      details: { ...node.data.details, steps, quickReplies },
    },
  }
}

function convert(startNode: unknown) {
  return convertStartNodeToMessengerAdsJson({
    startNode,
    flowId: FLOW_ID,
    flowVersionId: FLOW_VERSION_ID,
  })
}

describe("convertStartNodeToMessengerAdsJson", () => {
  test("plain text step is wrapped and allowed variables get the user_ prefix", () => {
    const node = makeStartNode([
      sendTextStepDefaultFn({ text: "Hi {{first_name}} {{full_name}}" }),
    ])

    const result = convert(node)

    expect(result).toEqual({
      status: "ok",
      messages: [
        { message: { text: "Hi {{user_first_name}} {{user_full_name}}" } },
      ],
    })
  })

  test("an unrecognized variable trips the Facebook-limitation error", () => {
    const node = makeStartNode([
      sendTextStepDefaultFn({ text: "Hello {{email}}" }),
    ])

    expect(convert(node)).toEqual({
      status: "error",
      reason: "invalidVariable",
    })
  })

  test("a disallowed step type (getUserData) is rejected", () => {
    const node = makeStartNode([getUserDataStepDefaultFn()])

    expect(convert(node)).toEqual({
      status: "error",
      reason: "invalidStepType",
    })
  })

  test("a non-sendMessage start node is rejected", () => {
    expect(convert({ type: "landingPage", id: "1", data: {} })).toEqual({
      status: "error",
      reason: "invalidStepType",
    })
  })

  test("an empty starting step yields an empty array", () => {
    expect(convert(makeStartNode([]))).toEqual({ status: "ok", messages: [] })
  })

  test("a carousel becomes a generic template with rewritten element text", () => {
    const card = {
      ...sendCardStepDefaultFn(),
      title: "Card {{full_name}}",
      subtitle: "Sub",
      image: {
        ...sendImageStepDefaultFn(),
        url: "https://cdn.example.com/a.jpg",
      },
      buttons: [],
    }
    const carousel = { ...sendCarouselStepDefaultFn(), cards: [card] }

    const result = convert(makeStartNode([carousel]))

    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      return
    }
    const payload = result.messages[0]?.message.attachment?.payload
    expect(payload?.template_type).toBe("generic")
    expect(payload?.elements?.[0]).toMatchObject({
      title: "Card {{user_full_name}}",
      subtitle: "Sub",
      image_url: "https://cdn.example.com/a.jpg",
    })
  })

  test("a carousel with more than 10 cards is chunked into multiple messages", () => {
    const makeCard = (i: number) => ({
      ...sendCardStepDefaultFn(),
      title: `Card ${i}`,
      buttons: [],
    })
    const cards = Array.from({ length: 23 }, (_, i) => makeCard(i))
    const carousel = { ...sendCarouselStepDefaultFn(), cards }

    const result = convert(makeStartNode([carousel]))

    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      return
    }
    // 23 cards → chunks of 10, 10, 3 → three generic templates.
    expect(result.messages).toHaveLength(3)
    const lengths = result.messages.map(
      (m) => m.message.attachment?.payload?.elements?.length,
    )
    expect(lengths).toEqual([10, 10, 3])
  })

  test("a text step with buttons becomes a button template with rewritten labels", () => {
    const node = makeStartNode([
      {
        ...sendTextStepDefaultFn({ text: "Pick one" }),
        buttons: [buttonStepDefaultFn({ label: "Hi {{first_name}}" })],
      },
    ])

    const result = convert(node)

    expect(result.status).toBe("ok")
    if (result.status !== "ok") {
      return
    }
    const payload = result.messages[0]?.message.attachment?.payload
    expect(payload?.template_type).toBe("button")
    expect(payload?.buttons?.[0]).toMatchObject({
      type: "postback",
      title: "Hi {{user_first_name}}",
    })
  })

  test("media steps emit a direct-URL attachment (no upload)", () => {
    const image = {
      ...sendImageStepDefaultFn(),
      url: "https://cdn.example.com/photo.jpg",
    }

    const result = convert(makeStartNode([image]))

    expect(result).toEqual({
      status: "ok",
      messages: [
        {
          message: {
            attachment: {
              type: "image",
              payload: {
                url: "https://cdn.example.com/photo.jpg",
                is_reusable: true,
              },
            },
          },
        },
      ],
    })
  })

  test("a sendMultipleImages step is allowed and emits a batched attachments[] message", () => {
    const step = {
      ...sendMultipleImagesStepDefaultFn(),
      images: [
        { id: "img-1", mode: "url", url: "https://cdn.example.com/a.jpg" },
        { id: "img-2", mode: "url", url: "https://cdn.example.com/b.jpg" },
      ],
    }

    const result = convert(makeStartNode([step]))

    expect(result).toEqual({
      status: "ok",
      messages: [
        {
          message: {
            attachments: [
              {
                type: "image",
                payload: {
                  url: "https://cdn.example.com/a.jpg",
                  is_reusable: true,
                },
              },
              {
                type: "image",
                payload: {
                  url: "https://cdn.example.com/b.jpg",
                  is_reusable: true,
                },
              },
            ],
          },
        },
      ],
    })
  })
})

function convertLenient(startNode: unknown) {
  return convertStartNodeToMessengerAdsJson({
    startNode,
    flowId: FLOW_ID,
    flowVersionId: FLOW_VERSION_ID,
    mode: "lenient",
  })
}

const IMAGE_URL = "https://cdn.example.com/a.jpg"

function validQuickReply() {
  return {
    ...buttonStepDefaultFn({ label: "Yes" }),
    buttonType: "sendMessage",
    beforeStep: startAnotherNodeStepDefaultFn({ nodeId: "1782439145670" }),
  }
}

describe("convertStartNodeToMessengerAdsJson (lenient)", () => {
  test("skips disallowed steps instead of failing", () => {
    const node = makeStartNode([
      getUserDataStepDefaultFn(),
      sendTextStepDefaultFn({ text: "Hi" }),
    ])

    expect(convertLenient(node)).toEqual({
      status: "ok",
      messages: [{ message: { text: "Hi" } }],
    })
  })

  test("blanks unknown variables and keeps the allowed ones", () => {
    const node = makeStartNode([
      sendTextStepDefaultFn({ text: "Hi {{first_name}}, code {{coupon}}" }),
    ])

    expect(convertLenient(node)).toEqual({
      status: "ok",
      messages: [{ message: { text: "Hi {{user_first_name}}, code " } }],
    })
  })

  test("drops a text message that is empty after stripping variables", () => {
    const node = makeStartNode([
      sendTextStepDefaultFn({ text: " {{phone}} " }),
      { ...sendImageStepDefaultFn(), mode: "url", url: IMAGE_URL },
    ])

    const result = convertLenient(node)

    expect(result.status === "ok" && result.messages).toEqual([
      {
        message: {
          attachment: {
            type: "image",
            payload: { url: IMAGE_URL, is_reusable: true },
          },
        },
      },
    ])
  })

  test("drops an empty-text step even when it has buttons", () => {
    const node = makeStartNode([
      sendTextStepDefaultFn({
        text: "{{phone}}",
        buttons: [
          {
            ...buttonStepDefaultFn({ label: "Go" }),
            buttonType: "sendMessage",
          },
        ],
      }),
    ])

    expect(convertLenient(node)).toEqual({ status: "ok", messages: [] })
  })

  test("sendGif becomes an image attachment", () => {
    const node = makeStartNode([{ ...sendGifStepDefaultFn(), url: IMAGE_URL }])

    const result = convertLenient(node)

    expect(result.status === "ok" && result.messages).toEqual([
      {
        message: {
          attachment: {
            type: "image",
            payload: { url: IMAGE_URL, is_reusable: true },
          },
        },
      },
    ])
  })

  test("a non-sendMessage start node yields no messages", () => {
    expect(convertLenient({ type: "landingPage", id: "1", data: {} })).toEqual({
      status: "ok",
      messages: [],
    })
  })

  test("quick replies ride on the last kept message", () => {
    const qr = validQuickReply()
    const node = makeStartNode(
      [sendTextStepDefaultFn({ text: "A" }), getUserDataStepDefaultFn()],
      [qr],
    )

    const result = convertLenient(node)

    expect(
      result.status === "ok" && result.messages[0].message.quick_replies,
    ).toHaveLength(1)
  })

  test("quick replies are dropped when every message is excluded", () => {
    const qr = validQuickReply()
    const node = makeStartNode([getUserDataStepDefaultFn()], [qr])

    expect(convertLenient(node)).toEqual({ status: "ok", messages: [] })
  })

  test("drops a quick reply whose label is blank after stripping variables", () => {
    const node = makeStartNode(
      [sendTextStepDefaultFn({ text: "Pick" })],
      [{ ...validQuickReply(), label: "{{city}}" }, validQuickReply()],
    )

    const result = convertLenient(node)

    expect(
      result.status === "ok" &&
        result.messages[0].message.quick_replies?.map((qr) => qr.title),
    ).toEqual(["Yes"])
  })

  test("omits quick_replies when every quick reply is blank", () => {
    const node = makeStartNode(
      [sendTextStepDefaultFn({ text: "Pick" })],
      [{ ...validQuickReply(), label: "{{city}}" }],
    )

    expect(convertLenient(node)).toEqual({
      status: "ok",
      messages: [{ message: { text: "Pick" } }],
    })
  })

  test("a text step whose only button is blank becomes plain text", () => {
    const node = makeStartNode([
      {
        ...sendTextStepDefaultFn({ text: "Pick one" }),
        buttons: [buttonStepDefaultFn({ label: "{{city}}" })],
      },
    ])

    expect(convertLenient(node)).toEqual({
      status: "ok",
      messages: [{ message: { text: "Pick one" } }],
    })
  })

  test("trims a button label left with whitespace by stripping", () => {
    const node = makeStartNode([
      {
        ...sendTextStepDefaultFn({ text: "Pick one" }),
        buttons: [buttonStepDefaultFn({ label: "Hi {{city}}" })],
      },
    ])

    const result = convertLenient(node)

    expect(
      result.status === "ok" &&
        result.messages[0].message.attachment?.payload?.buttons?.[0]?.title,
    ).toBe("Hi")
  })

  test("drops carousel cards with a blank title and omits a blank subtitle", () => {
    const card = (title: string, subtitle = "") => ({
      ...sendCardStepDefaultFn(),
      title,
      subtitle,
      buttons: [],
    })
    const carousel = {
      ...sendCarouselStepDefaultFn(),
      cards: [card("{{product}}"), card("Shoes", "{{price}}")],
    }

    const result = convertLenient(makeStartNode([carousel]))

    const elements =
      result.status === "ok"
        ? result.messages[0]?.message.attachment?.payload?.elements
        : undefined
    expect(elements).toHaveLength(1)
    expect(elements?.[0]?.title).toBe("Shoes")
    expect(elements?.[0]?.subtitle).toBeUndefined()
  })

  test("a carousel whose every card is blank yields no message", () => {
    const carousel = {
      ...sendCarouselStepDefaultFn(),
      cards: [
        { ...sendCardStepDefaultFn(), title: "{{product}}", buttons: [] },
      ],
    }

    expect(convertLenient(makeStartNode([carousel]))).toEqual({
      status: "ok",
      messages: [],
    })
  })

  test("strict mode still rejects an unknown variable in a label", () => {
    const node = makeStartNode(
      [sendTextStepDefaultFn({ text: "Pick" })],
      [{ ...validQuickReply(), label: "{{city}}" }],
    )

    expect(convert(node)).toEqual({
      status: "error",
      reason: "invalidVariable",
    })
  })

  test("strict mode still rejects sendGif", () => {
    const node = makeStartNode([{ ...sendGifStepDefaultFn(), url: IMAGE_URL }])

    expect(convert(node)).toEqual({
      status: "error",
      reason: "invalidStepType",
    })
  })
})
