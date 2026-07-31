import {
  buttonStepDefaultFn,
  chooseChannelStepDefaultFn,
  flowValidationCodes,
  openWebsiteStepDefaultFn,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendMessageNodeDefaultFn,
  waitNodeDefaultFn,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { publishFlowSchema } from "@/features/flows/schemas/action"

const makeReplyButton = (label: string) => buttonStepDefaultFn({ label })

// The default open-website step starts with an empty url, which only a draft
// save accepts, so the fixture fills one in before the publish schema sees it.
const makeWebsiteButton = (label: string) => ({
  ...buttonStepDefaultFn({ label }),
  buttonType: "openWebsite" as const,
  beforeStep: { ...openWebsiteStepDefaultFn(), url: "https://example.com" },
})

const makeWaitNode = () =>
  waitNodeDefaultFn({
    nodeProps: { id: "1000000000010", position: { x: 0, y: 0 } },
    dataProps: {},
    detailProps: {},
  })

/**
 * `detailProps` only accepts `beforeStep`, so the carousel step is layered on
 * after the defaults rather than passed through it.
 */
const makeCarouselNode = ({
  channel = "whatsapp",
  cardButtons,
}: {
  channel?: string
  cardButtons: ReturnType<typeof makeReplyButton>[][]
}) => {
  const node = sendMessageNodeDefaultFn({
    nodeProps: { id: "1000000000001", position: { x: 0, y: 0 } },
    dataProps: {},
    detailProps: { beforeStep: chooseChannelStepDefaultFn({ channel }) },
  })

  return {
    ...node,
    data: {
      ...node.data,
      details: {
        ...node.data.details,
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
    },
  }
}

const publish = (nodes: unknown[]) =>
  publishFlowSchema.safeParse({ nodes, edges: [] })

const firstIssueMessage = (nodes: unknown[]) =>
  publish(nodes).error?.issues[0]?.message

describe("publishFlowSchema — per-channel step validation", () => {
  test("rejects a WhatsApp carousel card that mixes a link button with a reply", () => {
    // Meta: a card holds either one URL button or quick replies. Mixed, the URL
    // is dropped at send time and the button silently becomes a reply.
    const node = makeCarouselNode({
      cardButtons: [
        [makeWebsiteButton("Open"), makeReplyButton("One")],
        [makeReplyButton("Two"), makeWebsiteButton("Visit")],
      ],
    })

    expect(firstIssueMessage([node])).toBe(
      flowValidationCodes.whatsappCarouselLinkButtonNotAlone,
    )
  })

  test("allows a link button that is the only button on every card", () => {
    const node = makeCarouselNode({
      cardButtons: [[makeWebsiteButton("Open")], [makeWebsiteButton("Visit")]],
    })

    expect(publish([node]).success).toBe(true)
  })

  test("leaves the same mixed card alone on a non-WhatsApp channel", () => {
    // Every other channel sends each card as its own message, so the URL button
    // survives and the WhatsApp-only override must not apply.
    const node = makeCarouselNode({
      channel: "omnichannel",
      cardButtons: [[makeWebsiteButton("Open"), makeReplyButton("One")]],
    })

    expect(publish([node]).success).toBe(true)
  })

  test("still rejects mismatched button counts across WhatsApp cards", () => {
    const node = makeCarouselNode({
      cardButtons: [[makeReplyButton("One")], []],
    })

    expect(firstIssueMessage([node])).toBe(
      flowValidationCodes.whatsappCarouselButtonsMismatch,
    )
  })

  test("reports the offending node and step in the issue path", () => {
    const wait = makeWaitNode()
    const node = makeCarouselNode({
      cardButtons: [[makeReplyButton("One")], []],
    })

    expect(publish([wait, node]).error?.issues[0]?.path).toEqual([
      "nodes",
      1,
      "data",
      "details",
      "steps",
      0,
      "cards",
    ])
  })

  test.each([
    [
      "matching reply buttons",
      [[makeReplyButton("One")], [makeReplyButton("Two")]],
    ],
    ["no buttons", [[], []]],
    ["a single card", [[makeReplyButton("One")]]],
  ])("allows %s", (_case, cardButtons) => {
    expect(publish([makeCarouselNode({ cardButtons })]).success).toBe(true)
  })

  test("ignores nodes that send no steps", () => {
    const node = makeWaitNode()

    expect(publish([node]).success).toBe(true)
  })
})
