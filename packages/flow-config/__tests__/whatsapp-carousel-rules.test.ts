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

const makeWebsiteButton = (label: string) => ({
  ...buttonStepDefaultFn({ label }),
  buttonType: "openWebsite" as const,
  beforeStep: openWebsiteStepDefaultFn(),
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

  test("rejects different button kinds with the same count", () => {
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
