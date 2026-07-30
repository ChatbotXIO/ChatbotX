import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  buttonStepDefaultFn,
  chooseChannelStepDefaultFn,
  flowValidationCodes,
  flowVersionSchema,
  openWebsiteStepDefaultFn,
  refineWhatsappCarouselButtons,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendMessageNodeDefaultFn,
  waitNodeDefaultFn,
} from "../src"

const publishNodesSchema = z
  .array(flowVersionSchema)
  .superRefine(refineWhatsappCarouselButtons)

const makeReplyButton = (label: string) => buttonStepDefaultFn({ label })

// The default open-website step starts with an empty url, which only a draft
// save accepts, so the fixture fills one in before the publish schema sees it.
const makeWebsiteButton = (label: string) => ({
  ...buttonStepDefaultFn({ label }),
  buttonType: "openWebsite" as const,
  beforeStep: { ...openWebsiteStepDefaultFn(), url: "https://example.com" },
})

const makeCarouselNode = ({
  channel = "whatsapp",
  cardButtons,
}: {
  channel?: string
  cardButtons: ReturnType<typeof makeReplyButton>[][]
}) =>
  sendMessageNodeDefaultFn({
    nodeProps: {
      id: "1000000000001",
      labelVersion: 1,
      position: { x: 0, y: 0 },
    },
    dataProps: {},
    detailProps: {
      beforeStep: chooseChannelStepDefaultFn({ channel }),
      steps: [
        {
          ...sendCarouselStepDefaultFn(),
          cards: cardButtons.map((buttons) => ({
            ...sendCardStepDefaultFn(),
            title: "Card",
            buttons,
          })),
        },
      ],
    },
  })

describe("WhatsApp carousel publish rules", () => {
  test("rejects different button counts and reports the node index", () => {
    const firstNode = waitNodeDefaultFn({
      nodeProps: {
        id: "1000000000010",
        labelVersion: 1,
        position: { x: 0, y: 0 },
      },
      dataProps: {},
      detailProps: {},
    })
    const node = makeCarouselNode({
      cardButtons: [[makeReplyButton("One")], []],
    })

    const result = publishNodesSchema.safeParse([firstNode, node])

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      code: "custom",
      message: flowValidationCodes.whatsappCarouselButtonsMismatch,
      path: [1],
    })
  })

  test("allows the same carousel for omnichannel nodes", () => {
    const node = makeCarouselNode({
      channel: "omnichannel",
      cardButtons: [[makeReplyButton("One")], []],
    })

    expect(publishNodesSchema.safeParse([node]).success).toBe(true)
  })

  test("rejects a link card next to a reply card", () => {
    // A lone "open website" button is sent as Meta's single URL button, so it is
    // a different button type than a reply even though both cards have one.
    const node = makeCarouselNode({
      cardButtons: [[makeWebsiteButton("Open")], [makeReplyButton("Reply")]],
    })

    expect(publishNodesSchema.safeParse([node]).success).toBe(false)
  })

  test.each([
    [
      "matching reply buttons",
      [[makeReplyButton("One")], [makeReplyButton("Two")]],
    ],
    [
      "a link button on every card",
      [[makeWebsiteButton("Open")], [makeWebsiteButton("Visit")]],
    ],
    [
      // A card cannot mix the two kinds, so both are sent as replies and the
      // card counts as a two-reply card on both sides of the comparison.
      "cards that each mix a link with a reply",
      [
        [makeWebsiteButton("Open"), makeReplyButton("One")],
        [makeReplyButton("Two"), makeWebsiteButton("Visit")],
      ],
    ],
    ["no buttons", [[], []]],
    ["one card", [[makeReplyButton("One")]]],
  ])("allows %s", (_case, cardButtons) => {
    const node = makeCarouselNode({ cardButtons })

    expect(publishNodesSchema.safeParse([node]).success).toBe(true)
  })

  test("ignores non-sendMessage nodes", () => {
    const node = waitNodeDefaultFn({
      nodeProps: {
        id: "1000000000010",
        labelVersion: 1,
        position: { x: 0, y: 0 },
      },
      dataProps: {},
      detailProps: {},
    })

    expect(publishNodesSchema.safeParse([node]).success).toBe(true)
  })
})
