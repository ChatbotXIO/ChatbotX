import {
  aiGenerateTextDefaultFn,
  buttonTypes,
  emailStepDefaultFn,
  type FlowNode,
  pageElementTypes,
  quickReplySettingsDefaultFn,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendMailNodeDefaultFn,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
  splitTrafficNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalFlowStepDefaultFn,
  whatsappOptionListStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { updateFlowVersionSchema } from "../../../schema/action"
import {
  duplicateFlowNode,
  duplicateFlowNodeData,
} from "../duplicate-node-data"

describe("duplicateFlowNodeData", () => {
  test("resets top-level quick reply routing state and ids", () => {
    const original = sendMessageNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    original.data.isStartNode = true
    original.data.details.steps = [
      sendTextStepDefaultFn({
        id: "2",
        text: "Hello",
        buttons: [
          {
            id: "3",
            label: "Nested",
            buttonType: buttonTypes.enum.startAnotherNode,
            beforeStep: startAnotherNodeStepDefaultFn({
              nodeId: "4",
              viewOnly: true,
            }),
            steps: [],
          },
        ],
      }),
    ]
    original.data.details.quickReplies = [
      {
        id: "5",
        label: "Reply",
        buttonType: buttonTypes.enum.startAnotherNode,
        beforeStep: startAnotherNodeStepDefaultFn({
          nodeId: "4",
          viewOnly: true,
        }),
        steps: [],
      },
    ]
    const node = {
      ...original,
      data: {
        ...original.data,
        forceToolbarVisible: true,
      },
    } as FlowNode

    const data = duplicateFlowNodeData(node)

    if (!("steps" in data.details && "quickReplies" in data.details)) {
      throw new Error("Expected duplicated node data to keep message details")
    }

    const firstStep = data.details.steps[0]

    expect(data.isStartNode).toBe(false)
    expect("forceToolbarVisible" in data).toBe(false)
    expect(firstStep.id).not.toBe("2")

    if (!("buttons" in firstStep)) {
      throw new Error("Expected duplicated step to keep buttons")
    }

    expect(firstStep.buttons[0].id).not.toBe("3")
    expect(firstStep.buttons[0]).toMatchObject({
      label: "Nested",
      buttonType: null,
      beforeStep: null,
      steps: [],
    })
    expect(data.details.quickReplies).toHaveLength(1)
    expect(data.details.quickReplies[0].id).not.toBe("5")
    expect(data.details.quickReplies[0]).toMatchObject({
      label: "Reply",
      buttonType: null,
      beforeStep: null,
      steps: [],
    })

    const duplicatedNode = duplicateFlowNode({
      ...node,
      measured: undefined,
    } as FlowNode)

    const result = updateFlowVersionSchema.safeParse({
      nodes: [duplicatedNode],
      edges: [],
    })

    expect(duplicatedNode.measured).toEqual({ width: 288, height: 100 })
    expect(result.success, result.error?.message).toBe(true)
  })

  test("resets nested carousel buttons, option ids, and state handles", () => {
    const original = sendMessageNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    original.data.details.steps = [
      sendCarouselStepDefaultFn(),
      whatsappOptionListStepDefaultFn({
        id: "10",
        text: "Choose",
        buttonId: "11",
        buttonLabel: "Open",
        options: [
          { id: "12", title: "One" },
          { id: "13", title: "Two" },
        ],
      }),
      aiGenerateTextDefaultFn({
        id: "14",
        text: "Prompt",
        outputFieldId: "15",
        states: [
          { id: "16", stateType: "success" },
          { id: "17", stateType: "error" },
        ],
      }),
    ]

    const carouselStep = original.data.details.steps[0]
    if (!("cards" in carouselStep)) {
      throw new Error("Expected carousel step")
    }

    carouselStep.cards = [sendCardStepDefaultFn()]
    carouselStep.cards[0].id = "7"
    carouselStep.cards[0].title = "Card"
    carouselStep.cards[0].buttons = [
      {
        id: "8",
        label: "Card button",
        buttonType: buttonTypes.enum.startAnotherNode,
        beforeStep: startAnotherNodeStepDefaultFn({
          nodeId: "9",
          viewOnly: true,
        }),
        steps: [],
      },
    ]

    const duplicatedNode = duplicateFlowNode(original as FlowNode)
    const data = duplicatedNode.data

    if (!("steps" in data.details)) {
      throw new Error("Expected duplicated message steps")
    }

    const duplicatedCarousel = data.details.steps[0]
    const duplicatedOptionList = data.details.steps[1]
    const duplicatedAI = data.details.steps[2]

    if (!("cards" in duplicatedCarousel)) {
      throw new Error("Expected duplicated carousel")
    }
    if (!("options" in duplicatedOptionList)) {
      throw new Error("Expected duplicated option list")
    }
    if (!("states" in duplicatedAI && duplicatedAI.states)) {
      throw new Error("Expected duplicated AI states")
    }

    expect(duplicatedCarousel.cards[0].id).not.toBe("7")
    expect(duplicatedCarousel.cards[0].buttons[0].id).not.toBe("8")
    expect(duplicatedCarousel.cards[0].buttons[0]).toMatchObject({
      label: "Card button",
      buttonType: null,
      beforeStep: null,
      steps: [],
    })
    expect(duplicatedOptionList.buttonId).not.toBe("11")
    expect(duplicatedOptionList.options.map((option) => option.id)).not.toEqual(
      ["12", "13"],
    )
    expect(duplicatedAI.states.map((state) => state.id)).not.toEqual([
      "16",
      "17",
    ])

    const result = updateFlowVersionSchema.safeParse({
      nodes: [duplicatedNode],
      edges: [],
    })

    expect(result.success, result.error?.message).toBe(true)
  })

  test("resets email button element ids and routing state", () => {
    const original = sendMailNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    original.data.details.steps = [
      emailStepDefaultFn({
        id: "2",
        integrationSmtpId: "3",
        from: "from@example.com",
        to: "to@example.com",
        subject: "Subject",
        preheader: "Preheader",
        elements: [
          {
            id: "4",
            type: pageElementTypes.enum.button,
            label: "Email button",
            buttonType: buttonTypes.enum.startAnotherNode,
            beforeStep: startAnotherNodeStepDefaultFn({
              nodeId: "5",
              viewOnly: true,
            }),
            steps: [],
          },
        ],
      }),
    ]

    const duplicatedNode = duplicateFlowNode({
      ...original,
      measured: undefined,
      data: {
        ...original.data,
        forceToolbarVisible: true,
      },
    } as FlowNode)

    if (!("steps" in duplicatedNode.data.details)) {
      throw new Error("Expected duplicated email steps")
    }

    const duplicatedEmail = duplicatedNode.data.details.steps[0]
    if (!("elements" in duplicatedEmail)) {
      throw new Error("Expected duplicated email elements")
    }

    expect("forceToolbarVisible" in duplicatedNode.data).toBe(false)
    expect(duplicatedEmail.elements[0].id).not.toBe("4")
    expect(duplicatedEmail.elements[0]).toMatchObject({
      type: pageElementTypes.enum.button,
      label: "Email button",
      buttonType: null,
      beforeStep: null,
      steps: [],
    })

    const result = updateFlowVersionSchema.safeParse({
      nodes: [duplicatedNode],
      edges: [],
    })

    expect(result.success, result.error?.message).toBe(true)
  })

  test("resets split traffic case targets because duplicated edges are not copied", () => {
    const original = splitTrafficNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    original.data.details.steps[0].cases = [
      { value: 50, nodeId: "2" },
      { value: 50, nodeId: "3" },
    ]

    const duplicatedNode = duplicateFlowNode(original as FlowNode)

    if (!("steps" in duplicatedNode.data.details)) {
      throw new Error("Expected duplicated split traffic steps")
    }

    const duplicatedSplitTraffic = duplicatedNode.data.details.steps[0]
    if (!("cases" in duplicatedSplitTraffic)) {
      throw new Error("Expected duplicated split traffic cases")
    }

    expect(duplicatedSplitTraffic.cases).toEqual([
      { value: 50, nodeId: null },
      { value: 50, nodeId: null },
    ])

    const result = updateFlowVersionSchema.safeParse({
      nodes: [duplicatedNode],
      edges: [],
    })

    expect(result.success, result.error?.message).toBe(true)
  })
})

describe("duplicateFlowNodeData — quick reply settings", () => {
  test("regenerates section ids and drops edge-routed targets", () => {
    const original = sendMessageNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    original.data.details.steps = [
      sendTextStepDefaultFn({ id: "2", text: "Hi" }),
    ]
    original.data.details.quickReplies = [
      {
        id: "3",
        label: "Yes",
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
    ]
    const settings = quickReplySettingsDefaultFn()
    settings.followUp = {
      ...settings.followUp,
      enabled: true,
      target: {
        buttonType: buttonTypes.enum.startAnotherNode,
        beforeStep: startAnotherNodeStepDefaultFn({
          nodeId: "4",
          viewOnly: true,
        }),
      },
    }
    settings.retry = {
      ...settings.retry,
      enabled: true,
      message: "Tap",
      target: {
        buttonType: buttonTypes.enum.startExternalFlow,
        beforeStep: startExternalFlowStepDefaultFn(),
      },
    }
    original.data.details.quickReplySettings = settings

    const copy = duplicateFlowNodeData(original)
    const copied = (copy.details as typeof original.data.details)
      .quickReplySettings

    expect(copied?.followUp.id).not.toBe(settings.followUp.id)
    expect(copied?.retry.id).not.toBe(settings.retry.id)
    // The copy has no edges, so a node-jump target would point nowhere.
    expect(copied?.followUp).toMatchObject({ enabled: false, target: null })
    // External targets don't depend on edges and are kept.
    expect(copied?.retry).toMatchObject({
      enabled: true,
      target: { buttonType: buttonTypes.enum.startExternalFlow },
    })
  })

  test("copies a partial settings object without throwing", () => {
    const original = sendMessageNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
    })
    const settings = quickReplySettingsDefaultFn()
    original.data.details.quickReplySettings = {
      retry: settings.retry,
    } as unknown as typeof settings

    const copy = duplicateFlowNodeData(original)
    const copied = (copy.details as typeof original.data.details)
      .quickReplySettings

    expect(copied?.followUp).toBeUndefined()
    expect(copied?.retry.id).not.toBe(settings.retry.id)
  })
})
