import { describe, expect, test } from "vitest"
import { convertFlowStepCarousel } from "../src/handlers/message/outgoing-message/send-carousel"

const createCard = (index: number) => ({
  id: `card-${index}`,
  stepType: "sendCard",
  title: `Card ${index}`,
  subtitle: `Subtitle ${index}`,
  image: { url: `https://example.com/${index}.png` },
  buttons: [
    {
      id: `btn-${index}`,
      label: `Button ${index}`,
      buttonType: null,
      beforeStep: null,
      steps: [],
    },
  ],
})

const createCards = (count: number) =>
  Array.from({ length: count }, (_, index) => createCard(index + 1))

const convert = (step: Record<string, unknown>) =>
  Array.from(
    convertFlowStepCarousel({
      data: {
        contact: { id: "ci-1" },
        flowId: "flow-1",
        flowVersionId: "fv-1",
        step,
      },
    } as never),
  )

type CarouselMessage = ReturnType<typeof convert>[number]

const payloadOf = (message: CarouselMessage) => message.attachment.payload

describe("messenger carousel layout", () => {
  test("renders a horizontal carousel at Meta's 1.91:1 aspect ratio", () => {
    const [message, ...rest] = convert({
      id: "step-1",
      stepType: "sendCarousel",
      layout: "horizontal",
      cards: createCards(3),
    })

    expect(rest).toHaveLength(0)
    expect(payloadOf(message)).toEqual(
      expect.objectContaining({
        template_type: "generic",
        image_aspect_ratio: "horizontal",
      }),
    )
  })

  test("renders a vertical carousel at Meta's square aspect ratio", () => {
    const [message] = convert({
      id: "step-1",
      stepType: "sendCarousel",
      layout: "vertical",
      cards: createCards(3),
    })

    expect(payloadOf(message)).toEqual(
      expect.objectContaining({ image_aspect_ratio: "square" }),
    )
  })

  test("keeps a vertical carousel in one scrollable strip rather than splitting it", () => {
    const messages = convert({
      id: "step-1",
      stepType: "sendCarousel",
      layout: "vertical",
      cards: createCards(3),
    })

    expect(
      messages.map((message) =>
        payloadOf(message).elements.map((element) => element.title),
      ),
    ).toEqual([["Card 1", "Card 2", "Card 3"]])
  })

  test("keeps each card's subtitle, image and buttons", () => {
    const [message] = convert({
      id: "step-1",
      stepType: "sendCarousel",
      layout: "vertical",
      cards: [createCard(1)],
    })

    expect(payloadOf(message).elements).toEqual([
      expect.objectContaining({
        title: "Card 1",
        subtitle: "Subtitle 1",
        image_url: "https://example.com/1.png",
        buttons: [expect.objectContaining({ title: "Button 1" })],
      }),
    ])
  })

  test("repeats the aspect ratio on every chunk past the ten element limit", () => {
    const messages = convert({
      id: "step-1",
      stepType: "sendCarousel",
      layout: "vertical",
      cards: createCards(12),
    })

    expect(
      messages.map((message) => [
        payloadOf(message).elements.length,
        payloadOf(message).image_aspect_ratio,
      ]),
    ).toEqual([
      [10, "square"],
      [2, "square"],
    ])
  })

  test("falls back to horizontal for rows persisted before the layout field existed", () => {
    const [message] = convert({
      id: "step-1",
      stepType: "sendCarousel",
      cards: createCards(3),
    })

    expect(payloadOf(message)).toEqual(
      expect.objectContaining({ image_aspect_ratio: "horizontal" }),
    )
  })
})
