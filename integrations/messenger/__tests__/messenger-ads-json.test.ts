import {
  buttonStepDefaultFn,
  getUserDataStepDefaultFn,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendImageStepDefaultFn,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
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
})
