import type { FlowNode } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { clone } from "remeda"

type MutableRecord = Record<string, unknown>

const DEFAULT_NODE_MEASURED = { width: 288, height: 100 }

const isRecord = (value: unknown): value is MutableRecord =>
  typeof value === "object" && value !== null

const resetButtonForDuplicate = <T extends MutableRecord>(button: T): T =>
  ({
    ...clone(button),
    id: createId(),
    beforeStep: null,
    buttonType: null,
    steps: [],
  }) as T

const duplicateElement = <T extends MutableRecord>(element: T): T => {
  if (element.type === "button") {
    return resetButtonForDuplicate(element)
  }

  return {
    ...clone(element),
    id: createId(),
  } as T
}

const duplicateStep = <T extends MutableRecord>(step: T): T => {
  const nextStep = {
    ...clone(step),
    id: createId(),
  } as MutableRecord

  if (Array.isArray(nextStep.states)) {
    nextStep.states = nextStep.states.map((state) =>
      isRecord(state) ? { ...clone(state), id: createId() } : state,
    )
  }

  if (Array.isArray(nextStep.buttons)) {
    nextStep.buttons = nextStep.buttons.map((button) =>
      resetButtonForDuplicate(button as MutableRecord),
    )
  }

  if (Array.isArray(nextStep.cards)) {
    nextStep.cards = nextStep.cards.map((card) =>
      isRecord(card) ? duplicateStep(card) : card,
    )
  }

  if (Array.isArray(nextStep.elements)) {
    nextStep.elements = nextStep.elements.map((element) =>
      isRecord(element) ? duplicateElement(element) : element,
    )
  }

  if (Array.isArray(nextStep.options)) {
    nextStep.options = nextStep.options.map((option) =>
      isRecord(option) ? { ...clone(option), id: createId() } : option,
    )
  }

  if (Array.isArray(nextStep.cases)) {
    nextStep.cases = nextStep.cases.map((caseItem) =>
      isRecord(caseItem) ? { ...clone(caseItem), nodeId: null } : caseItem,
    )
  }

  if (typeof nextStep.buttonId === "string") {
    nextStep.buttonId = createId()
  }

  if (isRecord(nextStep.image)) {
    nextStep.image = duplicateStep(nextStep.image)
  }

  return nextStep as T
}

export const duplicateFlowNodeData = (node: FlowNode): FlowNode["data"] => {
  const details = clone(node.data.details)

  if ("beforeStep" in details && details.beforeStep) {
    details.beforeStep.id = createId()
  }

  if ("steps" in details && Array.isArray(details.steps)) {
    details.steps = details.steps.map((step) =>
      duplicateStep(step as MutableRecord),
    ) as typeof details.steps
  }

  if ("quickReplies" in details && Array.isArray(details.quickReplies)) {
    details.quickReplies = details.quickReplies.map((button) =>
      resetButtonForDuplicate(button as MutableRecord),
    ) as typeof details.quickReplies
  }

  return {
    name: `${node.data.name} Copy`,
    isStartNode: false,
    details,
  } as FlowNode["data"]
}

export const duplicateFlowNode = (node: FlowNode): FlowNode =>
  ({
    id: createId(),
    type: node.type,
    position: {
      x: node.position.x + 100,
      y: node.position.y + 100,
    },
    measured: {
      width: node.measured?.width ?? DEFAULT_NODE_MEASURED.width,
      height: node.measured?.height ?? DEFAULT_NODE_MEASURED.height,
    },
    data: duplicateFlowNodeData(node),
  }) as FlowNode
