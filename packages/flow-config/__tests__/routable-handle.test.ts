import { describe, expect, test } from "vitest"
import type { FlowNode, PageElementSchema } from "../src"
import {
  applyRouteInNode,
  applyRouteUpdatesInNodes,
  buttonStepDefaultFn,
  buttonTypes,
  emailStepDefaultFn,
  getNodeFromButton,
  pageElementTypes,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendMailNodeDefaultFn,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
  startAnotherNodeStepDefaultFn,
  whatsappOptionListStepDefaultFn,
} from "../src"

type SendMessageDetails = Parameters<
  typeof sendMessageNodeDefaultFn
>[0]["detailProps"]

const makeMessageNode = (
  id: string,
  detailProps: SendMessageDetails,
): FlowNode =>
  sendMessageNodeDefaultFn({
    nodeProps: { id },
    detailProps,
  }) as FlowNode

const makeButton = (id: string, label = id) => ({
  ...buttonStepDefaultFn({ label }),
  id,
})

const getMessageSteps = (node: FlowNode) => {
  if (!("quickReplies" in node.data.details)) {
    throw new Error("Expected a send-message node")
  }
  return node.data.details.steps
}

const getSteps = (node: FlowNode) => {
  if (!("steps" in node.data.details)) {
    throw new Error("Expected a node with steps")
  }
  return node.data.details.steps
}

/** Mirrors a flow version persisted before `quickReplies` joined the schema. */
const stripQuickReplies = (node: FlowNode): FlowNode =>
  ({
    ...node,
    data: {
      ...node.data,
      details: Object.fromEntries(
        Object.entries(node.data.details).filter(
          ([key]) => key !== "quickReplies",
        ),
      ),
    },
  }) as FlowNode

/**
 * Mirrors a card persisted before #381, when the schema was a union that let a
 * card carry only a subtitle or only an image — with no `buttons` key at all.
 */
const stripCardButtons = <Card extends { buttons: unknown }>(card: Card) =>
  Object.fromEntries(
    Object.entries(card).filter(([key]) => key !== "buttons"),
  ) as Card

const getMailElements = (node: FlowNode) => {
  if (
    !(
      "steps" in node.data.details &&
      node.data.details.steps.every((step) => "elements" in step)
    )
  ) {
    throw new Error("Expected a send-mail node")
  }
  return node.data.details.steps[0].elements
}

describe("getNodeFromButton", () => {
  test("finds top-level and carousel buttons without changing the result shape", () => {
    const topLevelButton = makeButton("top-level", "Top level")
    const cardButtons = [
      makeButton("card-first", "First"),
      makeButton("card-middle", "Middle"),
      makeButton("card-last", "Last"),
    ]
    const cards = cardButtons.map((button, index) => ({
      ...sendCardStepDefaultFn(),
      id: `card-${index}`,
      title: `Card ${index}`,
      buttons: [button],
    }))
    const node = makeMessageNode("owner-node", {
      steps: [
        sendTextStepDefaultFn({ buttons: [topLevelButton], text: "Hello" }),
        { ...sendCarouselStepDefaultFn(), cards },
      ],
    })

    expect(getNodeFromButton([node], topLevelButton.id)).toEqual({
      button: topLevelButton,
      nodeId: "owner-node",
    })
    for (const button of cardButtons) {
      expect(getNodeFromButton([node], button.id)).toEqual({
        button,
        nodeId: "owner-node",
      })
    }
  })

  test("prefers a step nodeId and preserves WhatsApp option synthesis", () => {
    const button = makeButton("button")
    const textStep = sendTextStepDefaultFn({
      buttons: [button],
      nodeId: "runtime-node",
      text: "Hello",
    })
    const optionStep = whatsappOptionListStepDefaultFn({
      nodeId: "option-runtime-node",
      options: [{ id: "option", title: "Choice", description: "Description" }],
    })
    const node = makeMessageNode("owner-node", {
      steps: [textStep, optionStep],
    })

    expect(getNodeFromButton([node], button.id).nodeId).toBe("runtime-node")
    expect(getNodeFromButton([node], "option")).toEqual({
      button: {
        id: "option",
        label: "Choice",
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
      nodeId: "option-runtime-node",
    })
  })

  test("does not expose page elements and returns nulls for an unknown id", () => {
    const handleId = "email-handle"
    const mailNode = makeMailNode("mail-node", handleId)

    expect(getNodeFromButton([mailNode], handleId)).toEqual({
      button: null,
      nodeId: null,
    })
    expect(getNodeFromButton([mailNode], "missing")).toEqual({
      button: null,
      nodeId: null,
    })
  })

  test("preserves step order when legacy containers reuse a button id", () => {
    const carouselButton = makeButton("duplicate", "Carousel first")
    const topLevelButton = makeButton("duplicate", "Top level later")
    const node = makeMessageNode("owner-node", {
      steps: [
        {
          ...sendCarouselStepDefaultFn(),
          cards: [
            {
              ...sendCardStepDefaultFn(),
              title: "First step",
              buttons: [carouselButton],
            },
          ],
        },
        sendTextStepDefaultFn({
          buttons: [topLevelButton],
          text: "Second step",
        }),
      ],
    })

    expect(getNodeFromButton([node], "duplicate").button).toEqual(
      carouselButton,
    )
  })

  test("finds buttons in legacy flow nodes without a React Flow type", () => {
    const button = makeButton("legacy-button")
    const node = makeMessageNode("legacy-node", {
      steps: [sendTextStepDefaultFn({ buttons: [button], text: "Legacy" })],
    })
    node.type = undefined

    expect(getNodeFromButton([node], button.id)).toEqual({
      button,
      nodeId: "legacy-node",
    })
  })
})

const makeMailNode = (id: string, buttonId: string): FlowNode => {
  const button: PageElementSchema = {
    id: buttonId,
    type: pageElementTypes.enum.button,
    label: "Email button",
    buttonType: buttonTypes.enum.startAnotherNode,
    beforeStep: {
      ...startAnotherNodeStepDefaultFn({
        nodeId: "old-target",
        viewOnly: true,
      }),
      id: "email-before-step",
    },
    steps: [],
  }
  const node = sendMailNodeDefaultFn({ nodeProps: { id } })
  node.data.details.steps = [
    emailStepDefaultFn({
      id: "email-step",
      elements: [button],
    }),
  ]
  return node as FlowNode
}

describe("applyRouteInNode", () => {
  test("connects and disconnects a top-level button immutably", () => {
    const button = makeButton("button")
    const untouchedStep = sendTextStepDefaultFn({ text: "Untouched" })
    const node = makeMessageNode("owner-node", {
      steps: [
        untouchedStep,
        sendTextStepDefaultFn({ buttons: [button], text: "Target" }),
      ],
    })
    const originalNode = structuredClone(node)

    const connected = applyRouteInNode(node, button.id, {
      targetNodeId: "target-node",
    })
    expect(connected).not.toBeNull()
    expect(connected).not.toBe(node)
    expect(getMessageSteps(connected as FlowNode)[0]).toBe(untouchedStep)
    expect(node).toEqual(originalNode)

    const connectedButton = getNodeFromButton(
      [connected as FlowNode],
      button.id,
    ).button
    expect(connectedButton).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: {
        nodeId: "target-node",
        viewOnly: true,
      },
    })

    const disconnected = applyRouteInNode(
      connected as FlowNode,
      button.id,
      null,
    )
    expect(
      getNodeFromButton([disconnected as FlowNode], button.id).button,
    ).toMatchObject({
      buttonType: null,
      beforeStep: null,
    })
  })

  test.each([
    "first",
    "middle",
    "last",
  ] as const)("updates a carousel button in the %s card and preserves unrelated references", (position) => {
    const positions = ["first", "middle", "last"] as const
    const cards = positions.map((cardPosition) => ({
      ...sendCardStepDefaultFn(),
      id: `card-${cardPosition}`,
      title: cardPosition,
      buttons: [makeButton(`button-${cardPosition}`)],
    }))
    const carousel = { ...sendCarouselStepDefaultFn(), cards }
    const node = makeMessageNode("owner-node", { steps: [carousel] })

    const updated = applyRouteInNode(node, `button-${position}`, {
      targetNodeId: "target-node",
    })
    const updatedCarousel = getMessageSteps(updated as FlowNode)[0]
    if (!("cards" in updatedCarousel)) {
      throw new Error("Expected carousel step")
    }

    expect(updated?.id).toBe("owner-node")
    for (let index = 0; index < cards.length; index += 1) {
      expect(updatedCarousel.cards[index] === cards[index]).toBe(
        positions[index] !== position,
      )
    }
    expect(
      getNodeFromButton([updated as FlowNode], `button-${position}`).button,
    ).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: { nodeId: "target-node" },
    })
    expect(getNodeFromButton([node], `button-${position}`).button).toEqual(
      makeButton(`button-${position}`),
    )

    const disconnected = applyRouteInNode(
      updated as FlowNode,
      `button-${position}`,
      null,
    )
    expect(
      getNodeFromButton([disconnected as FlowNode], `button-${position}`)
        .button,
    ).toMatchObject({
      buttonType: null,
      beforeStep: null,
    })
  })

  test("connects and disconnects a page button while keeping runtime lookup disabled", () => {
    const node = makeMailNode("mail-node", "email-handle")
    const connected = applyRouteInNode(node, "email-handle", {
      targetNodeId: "new-target",
    })
    const connectedButton = getMailElements(
      connected as FlowNode,
    )[0] as Extract<PageElementSchema, { type: "button" }>
    expect(connectedButton).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: {
        nodeId: "new-target",
        viewOnly: true,
      },
    })

    expect(connectedButton.beforeStep?.id).not.toBe("email-handle")

    const disconnected = applyRouteInNode(
      connected as FlowNode,
      "email-handle",
      null,
    )
    const disconnectedButton = getMailElements(
      disconnected as FlowNode,
    )[0] as Extract<PageElementSchema, { type: "button" }>
    expect(disconnectedButton).toMatchObject({
      buttonType: null,
      beforeStep: null,
    })
    expect(getMailElements(node)[0]).not.toBe(disconnectedButton)
    expect(
      getNodeFromButton([disconnected as FlowNode], "email-handle"),
    ).toEqual({
      button: null,
      nodeId: null,
    })
  })

  test("does not update WhatsApp options, unknown handles, or another owner node", () => {
    const optionNode = makeMessageNode("option-owner", {
      steps: [
        whatsappOptionListStepDefaultFn({
          options: [{ id: "shared-id", title: "Option" }],
        }),
      ],
    })
    const button = makeButton("shared-id")
    const buttonNode = makeMessageNode("button-owner", {
      steps: [sendTextStepDefaultFn({ buttons: [button], text: "Hello" })],
    })

    expect(
      applyRouteInNode(optionNode, "shared-id", {
        targetNodeId: "target-node",
      }),
    ).toBeNull()
    expect(applyRouteInNode(buttonNode, "missing", null)).toBeNull()

    const updated = applyRouteInNode(buttonNode, "shared-id", {
      targetNodeId: "target-node",
    })
    expect(updated?.id).toBe("button-owner")
    expect(optionNode.data).toBe(optionNode.data)
  })

  test("keeps the canvas owner id when a step has a runtime nodeId", () => {
    const button = makeButton("button")
    const node = makeMessageNode("owner-node", {
      steps: [
        sendTextStepDefaultFn({
          buttons: [button],
          nodeId: "runtime-node",
          text: "Hello",
        }),
      ],
    })

    const updated = applyRouteInNode(node, button.id, {
      targetNodeId: "target-node",
    })

    expect(updated?.id).toBe("owner-node")
    expect(getNodeFromButton([updated as FlowNode], button.id).nodeId).toBe(
      "runtime-node",
    )
  })

  test("updates the same earliest step selected by runtime lookup for a duplicate legacy id", () => {
    const carouselButton = makeButton("duplicate", "Carousel first")
    const topLevelButton = makeButton("duplicate", "Top level later")
    const node = makeMessageNode("owner-node", {
      steps: [
        {
          ...sendCarouselStepDefaultFn(),
          cards: [
            {
              ...sendCardStepDefaultFn(),
              title: "First step",
              buttons: [carouselButton],
            },
          ],
        },
        sendTextStepDefaultFn({
          buttons: [topLevelButton],
          text: "Second step",
        }),
      ],
    })

    const updated = applyRouteInNode(node, "duplicate", {
      targetNodeId: "target-node",
    })
    const steps = getMessageSteps(updated as FlowNode)
    if (!("cards" in steps[0] && "buttons" in steps[1])) {
      throw new Error("Expected carousel and text steps")
    }

    expect(steps[0].cards[0].buttons[0]).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: { nodeId: "target-node" },
    })
    expect(steps[1].buttons[0]).toEqual(topLevelButton)
    expect(getNodeFromButton([updated as FlowNode], "duplicate").button).toBe(
      steps[0].cards[0].buttons[0],
    )
  })

  test("routes buttons in a legacy node persisted without quickReplies", () => {
    const topLevelButton = makeButton("legacy-top", "Top level")
    const cardButton = makeButton("legacy-card", "Card")
    const node = stripQuickReplies(
      makeMessageNode("legacy-node", {
        steps: [
          sendTextStepDefaultFn({ buttons: [topLevelButton], text: "Hello" }),
          {
            ...sendCarouselStepDefaultFn(),
            cards: [
              {
                ...sendCardStepDefaultFn(),
                id: "legacy-card-container",
                title: "Card",
                buttons: [cardButton],
              },
            ],
          },
        ],
      }),
    )

    expect("quickReplies" in node.data.details).toBe(false)
    expect(getNodeFromButton([node], cardButton.id).nodeId).toBe("legacy-node")

    const connected = applyRouteInNode(node, cardButton.id, {
      targetNodeId: "target-node",
    })
    const connectedSteps = getSteps(connected as FlowNode)
    if (!("cards" in connectedSteps[1])) {
      throw new Error("Expected a carousel step")
    }
    expect(connectedSteps[1].cards[0].buttons[0]).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: { nodeId: "target-node" },
    })

    const topLevelConnected = applyRouteInNode(node, topLevelButton.id, {
      targetNodeId: "target-node",
    })
    const topLevelSteps = getSteps(topLevelConnected as FlowNode)
    if (!("buttons" in topLevelSteps[0])) {
      throw new Error("Expected a text step")
    }
    expect(topLevelSteps[0].buttons[0]).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: { nodeId: "target-node" },
    })

    const disconnected = applyRouteInNode(
      connected as FlowNode,
      cardButton.id,
      null,
    )
    const disconnectedSteps = getSteps(disconnected as FlowNode)
    if (!("cards" in disconnectedSteps[1])) {
      throw new Error("Expected a carousel step")
    }
    expect(disconnectedSteps[1].cards[0].buttons[0]).toMatchObject({
      buttonType: null,
      beforeStep: null,
    })
  })

  test("routes past a legacy card persisted without a buttons array", () => {
    const cardButton = makeButton("second-card-button", "Card")
    const node = makeMessageNode("legacy-cards-node", {
      steps: [
        {
          ...sendCarouselStepDefaultFn(),
          cards: [
            stripCardButtons({
              ...sendCardStepDefaultFn(),
              id: "subtitle-only-card",
              title: "Subtitle only",
              subtitle: "No buttons key at all",
            }),
            {
              ...sendCardStepDefaultFn(),
              id: "card-with-button",
              title: "Card",
              buttons: [cardButton],
            },
          ],
        },
      ],
    })

    expect("buttons" in getSteps(node)[0].cards[0]).toBe(false)
    expect(getNodeFromButton([node], cardButton.id).nodeId).toBe(
      "legacy-cards-node",
    )

    const connected = applyRouteInNode(node, cardButton.id, {
      targetNodeId: "target-node",
    })
    const connectedSteps = getSteps(connected as FlowNode)
    if (!("cards" in connectedSteps[0])) {
      throw new Error("Expected a carousel step")
    }
    expect(connectedSteps[0].cards[1].buttons[0]).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: { nodeId: "target-node" },
    })
  })
})

describe("applyRouteUpdatesInNodes", () => {
  test("applies multiple route changes to the same source node atomically", () => {
    const firstButton = makeButton("first")
    const secondButton = makeButton("second")
    const sourceNode = makeMessageNode("source-node", {
      steps: [
        sendTextStepDefaultFn({
          buttons: [firstButton],
          text: "Top-level button",
        }),
        {
          ...sendCarouselStepDefaultFn(),
          cards: [
            {
              ...sendCardStepDefaultFn(),
              buttons: [secondButton],
              title: "Carousel button",
            },
          ],
        },
      ],
    })
    const connectedNode = applyRouteUpdatesInNodes(
      [sourceNode],
      [
        {
          sourceNodeId: sourceNode.id,
          handleId: firstButton.id,
          route: { targetNodeId: "first-target" },
        },
        {
          sourceNodeId: sourceNode.id,
          handleId: secondButton.id,
          route: { targetNodeId: "second-target" },
        },
      ],
    )[0]

    const disconnectedNode = applyRouteUpdatesInNodes(
      [connectedNode],
      [
        {
          sourceNodeId: sourceNode.id,
          handleId: firstButton.id,
          route: null,
        },
        {
          sourceNodeId: sourceNode.id,
          handleId: secondButton.id,
          route: null,
        },
      ],
    )[0]

    expect(
      getNodeFromButton([disconnectedNode], firstButton.id).button,
    ).toMatchObject({
      buttonType: null,
      beforeStep: null,
    })
    expect(
      getNodeFromButton([disconnectedNode], secondButton.id).button,
    ).toMatchObject({
      buttonType: null,
      beforeStep: null,
    })
  })

  test("scopes duplicate handle ids to their declared source node", () => {
    const firstNode = makeMessageNode("first-node", {
      steps: [
        sendTextStepDefaultFn({
          buttons: [makeButton("duplicate")],
          text: "First",
        }),
      ],
    })
    const secondNode = makeMessageNode("second-node", {
      steps: [
        sendTextStepDefaultFn({
          buttons: [makeButton("duplicate")],
          text: "Second",
        }),
      ],
    })

    const result = applyRouteUpdatesInNodes(
      [firstNode, secondNode],
      [
        {
          sourceNodeId: secondNode.id,
          handleId: "duplicate",
          route: { targetNodeId: "target-node" },
        },
      ],
    )

    expect(result[0]).toBe(firstNode)
    expect(getNodeFromButton([result[0]], "duplicate").button).toMatchObject({
      buttonType: null,
      beforeStep: null,
    })
    expect(getNodeFromButton([result[1]], "duplicate").button).toMatchObject({
      buttonType: buttonTypes.enum.startAnotherNode,
      beforeStep: { nodeId: "target-node" },
    })
  })

  test("preserves node and array references when no update applies", () => {
    const node = makeMessageNode("source-node", {
      steps: [sendTextStepDefaultFn({ text: "No button" })],
    })
    const nodes = [node]

    const result = applyRouteUpdatesInNodes(nodes, [
      {
        sourceNodeId: node.id,
        handleId: "missing",
        route: null,
      },
    ])

    expect(result).toBe(nodes)
    expect(result[0]).toBe(node)
  })
})
