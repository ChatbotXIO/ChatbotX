import type { FlowNode } from "./nodes/index"
import { type ButtonStepProps, buttonTypes } from "./steps/button"
import { type PageElementSchema, pageElementTypes } from "./steps/email"
import { startAnotherNodeStepDefaultFn } from "./steps/start-another-node"

export const routableHandleKinds = {
  stepButtons: "stepButtons",
  cardButtons: "cardButtons",
  listOptions: "listOptions",
  pageElements: "pageElements",
} as const

export type RoutableHandleKind =
  (typeof routableHandleKinds)[keyof typeof routableHandleKinds]

export type FlowRoute = Readonly<{ targetNodeId: string }> | null

export type FlowRouteUpdate = Readonly<{
  sourceNodeId: string
  handleId: string
  route: FlowRoute
}>

export type FoundRoutableButton = {
  button: ButtonStepProps
  runtimeNodeId: string
}

type LocatedRoutableButton = FoundRoutableButton & {
  stepIndex: number
}

type LocatedRouteUpdate = {
  node: FlowNode
  stepIndex: number
}

type StepBearingDetails = Extract<
  FlowNode["data"]["details"],
  { steps: readonly unknown[] }
>
type FlowNodeStep = StepBearingDetails["steps"][number]
type CardBearingStep = Extract<FlowNodeStep, { cards: readonly unknown[] }>
type FlowCard = CardBearingStep["cards"][number]
type PageButtonElement = Extract<
  PageElementSchema,
  { type: typeof pageElementTypes.enum.button }
>

type RoutableHandleAccessor = {
  readonly kind: RoutableHandleKind
  readonly findButton: (
    node: FlowNode,
    handleId: string,
  ) => LocatedRoutableButton | null
  readonly applyRoute: (
    node: FlowNode,
    handleId: string,
    route: FlowRoute,
  ) => LocatedRouteUpdate | null
}

const replaceFirst = <Item>(
  items: readonly Item[],
  replaceItem: (item: Item) => Item | null,
): { items: Item[]; index: number } | null => {
  for (let index = 0; index < items.length; index += 1) {
    const replacement = replaceItem(items[index])
    if (replacement) {
      return {
        items: [
          ...items.slice(0, index),
          replacement,
          ...items.slice(index + 1),
        ],
        index,
      }
    }
  }

  return null
}

/**
 * A card's buttons as persisted, which older rows may not carry at all.
 *
 * `buttons` only became a required card field in #381; before that the schema
 * was a union accepting a card that held just a subtitle or just an image. Those
 * rows are still in the database and reach this module unparsed, so the declared
 * type describes new writes rather than old reads. Every other collection here
 * sits behind an `in` gate on the step; a card's buttons are one level below
 * that gate and so need their own.
 */
const readCardButtons = (card: FlowCard) => card.buttons ?? []

const createRouteFields = (route: FlowRoute) =>
  route
    ? {
        buttonType: buttonTypes.enum.startAnotherNode,
        beforeStep: startAnotherNodeStepDefaultFn({
          nodeId: route.targetNodeId,
          viewOnly: true,
        }),
      }
    : {
        buttonType: null,
        beforeStep: null,
      }

const updateButtonRoute = (
  button: ButtonStepProps,
  route: FlowRoute,
): ButtonStepProps => ({
  ...button,
  ...createRouteFields(route),
})

const updatePageButtonRoute = (
  button: PageButtonElement,
  route: FlowRoute,
): PageButtonElement => ({
  ...button,
  ...createRouteFields(route),
})

/**
 * Rewrites the first step that `updateStep` claims and rebuilds the node around
 * it.
 *
 * The gate is the structural presence of `steps`, mirroring the lookup side, so
 * that flow versions persisted before a details field existed still route. Node
 * JSON reaches this module straight from the database — drafts are stored as
 * `z.array(z.any())` and are never schema-parsed on load — so a node-type marker
 * field is not a dependable discriminator. Each accessor narrows the step it
 * owns instead.
 */
const updateNodeSteps = (
  node: FlowNode,
  updateStep: (step: FlowNodeStep) => FlowNodeStep | null,
): LocatedRouteUpdate | null => {
  const details = node.data.details
  if (!("steps" in details)) {
    return null
  }

  const replacement = replaceFirst<FlowNodeStep>(details.steps, updateStep)
  if (!replacement) {
    return null
  }

  return {
    // `updateStep` only ever returns the same step with one collection swapped,
    // so the node keeps its original shape at runtime. TypeScript cannot
    // correlate the details variant with its step variant across the union,
    // which is what this assertion stands in for.
    node: {
      ...node,
      data: {
        ...node.data,
        details: {
          ...details,
          steps: replacement.items,
        },
      },
    } as FlowNode,
    stepIndex: replacement.index,
  }
}

const stepButtonsAccessor: RoutableHandleAccessor = {
  kind: routableHandleKinds.stepButtons,
  findButton: (node, handleId) => {
    if (!("steps" in node.data.details)) {
      return null
    }

    for (
      let stepIndex = 0;
      stepIndex < node.data.details.steps.length;
      stepIndex += 1
    ) {
      const step = node.data.details.steps[stepIndex]
      if (!("buttons" in step)) {
        continue
      }

      const button = step.buttons.find((candidate) => candidate.id === handleId)
      if (button) {
        return {
          button,
          runtimeNodeId: step.nodeId ?? node.id,
          stepIndex,
        }
      }
    }

    return null
  },
  applyRoute: (node, handleId, route) =>
    updateNodeSteps(node, (step) => {
      if (!("buttons" in step)) {
        return null
      }

      const buttons = replaceFirst(step.buttons, (button) =>
        button.id === handleId ? updateButtonRoute(button, route) : null,
      )

      return buttons ? { ...step, buttons: buttons.items } : null
    }),
}

const cardButtonsAccessor: RoutableHandleAccessor = {
  kind: routableHandleKinds.cardButtons,
  findButton: (node, handleId) => {
    if (!("steps" in node.data.details)) {
      return null
    }

    for (
      let stepIndex = 0;
      stepIndex < node.data.details.steps.length;
      stepIndex += 1
    ) {
      const step = node.data.details.steps[stepIndex]
      if (!("cards" in step)) {
        continue
      }

      for (const card of step.cards) {
        const button = readCardButtons(card).find(
          (candidate) => candidate.id === handleId,
        )
        if (button) {
          return {
            button,
            runtimeNodeId: step.nodeId ?? node.id,
            stepIndex,
          }
        }
      }
    }

    return null
  },
  applyRoute: (node, handleId, route) =>
    updateNodeSteps(node, (step) => {
      if (!("cards" in step)) {
        return null
      }

      const cards = replaceFirst(step.cards, (card) => {
        const buttons = replaceFirst(readCardButtons(card), (button) =>
          button.id === handleId ? updateButtonRoute(button, route) : null,
        )
        return buttons ? { ...card, buttons: buttons.items } : null
      })

      return cards ? { ...step, cards: cards.items } : null
    }),
}

const listOptionsAccessor: RoutableHandleAccessor = {
  kind: routableHandleKinds.listOptions,
  findButton: (node, handleId) => {
    if (!("steps" in node.data.details)) {
      return null
    }

    for (
      let stepIndex = 0;
      stepIndex < node.data.details.steps.length;
      stepIndex += 1
    ) {
      const step = node.data.details.steps[stepIndex]
      if (!("options" in step)) {
        continue
      }

      const option = step.options.find((candidate) => candidate.id === handleId)
      if (option) {
        return {
          button: {
            id: option.id,
            label: option.title,
            buttonType: null,
            beforeStep: null,
            steps: [],
          },
          runtimeNodeId: step.nodeId ?? node.id,
          stepIndex,
        }
      }
    }

    return null
  },
  applyRoute: () => null,
}

const pageElementsAccessor: RoutableHandleAccessor = {
  kind: routableHandleKinds.pageElements,
  findButton: () => null,
  applyRoute: (node, handleId, route) =>
    updateNodeSteps(node, (step) => {
      if (!("elements" in step)) {
        return null
      }

      const elements = replaceFirst(step.elements, (element) => {
        if (
          element.type !== pageElementTypes.enum.button ||
          element.id !== handleId
        ) {
          return null
        }

        return updatePageButtonRoute(element, route)
      })

      return elements ? { ...step, elements: elements.items } : null
    }),
}

const routableHandleAccessors: readonly RoutableHandleAccessor[] = [
  stepButtonsAccessor,
  cardButtonsAccessor,
  listOptionsAccessor,
  pageElementsAccessor,
]

export const findButtonInNodes = (
  nodes: readonly FlowNode[],
  handleId: string,
): FoundRoutableButton | null => {
  for (const node of nodes) {
    let firstMatch: LocatedRoutableButton | null = null

    for (const accessor of routableHandleAccessors) {
      const found = accessor.findButton(node, handleId)
      if (found && (!firstMatch || found.stepIndex < firstMatch.stepIndex)) {
        firstMatch = found
      }
    }

    if (firstMatch) {
      const { button, runtimeNodeId } = firstMatch
      return { button, runtimeNodeId }
    }
  }

  return null
}

/**
 * Every accessor runs even after one matches: a duplicated handle id must
 * resolve to the earliest step so writes land where {@link findButtonInNodes}
 * reads. The discarded copies are bounded by the accessor count and this runs
 * once per builder interaction, never on a message-handling path.
 */
export const applyRouteInNode = (
  sourceNode: FlowNode,
  handleId: string,
  route: FlowRoute,
): FlowNode | null => {
  let firstUpdate: LocatedRouteUpdate | null = null

  for (const accessor of routableHandleAccessors) {
    const update = accessor.applyRoute(sourceNode, handleId, route)
    if (update && (!firstUpdate || update.stepIndex < firstUpdate.stepIndex)) {
      firstUpdate = update
    }
  }

  return firstUpdate?.node ?? null
}

export const applyRouteUpdatesInNodes = (
  nodes: FlowNode[],
  updates: readonly FlowRouteUpdate[],
): FlowNode[] => {
  const updatesBySourceNode = new Map<string, FlowRouteUpdate[]>()
  for (const update of updates) {
    const sourceUpdates = updatesBySourceNode.get(update.sourceNodeId)
    if (sourceUpdates) {
      sourceUpdates.push(update)
    } else {
      updatesBySourceNode.set(update.sourceNodeId, [update])
    }
  }

  let hasChanges = false
  const updatedNodes = nodes.map((node) => {
    const sourceUpdates = updatesBySourceNode.get(node.id)
    if (!sourceUpdates) {
      return node
    }

    let updatedNode = node
    for (const update of sourceUpdates) {
      const nextNode = applyRouteInNode(
        updatedNode,
        update.handleId,
        update.route,
      )
      if (nextNode) {
        updatedNode = nextNode
        hasChanges = true
      }
    }

    return updatedNode
  })

  return hasChanges ? updatedNodes : nodes
}
