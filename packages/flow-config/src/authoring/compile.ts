import { createId } from "@chatbotx.io/utils"
import { addNotesNodeDefaultFn } from "../nodes/add-notes"
import { conditionNodeDefaultFn } from "../nodes/condition"
import type { EdgeSchema, FlowNode, FlowVersionSchema } from "../nodes/index"
import { performActionNodeDefaultFn } from "../nodes/perform-action"
import { sendMessageNodeDefaultFn } from "../nodes/send-message"
import { startFlowNodeDefaultFn } from "../nodes/start-flow"
import { waitNodeDefaultFn } from "../nodes/wait"
import {
  applyRouteUpdatesInNodes,
  type FlowRouteUpdate,
} from "../routable-handle"
import { addContactTagStepDefaultFn } from "../steps/add-contact-tag"
import { addNotesStepDefaultFn } from "../steps/add-notes"
import { archiveConversationStepDefaultFn } from "../steps/archive-conversation"
import { assignConversationStepDefaultFn } from "../steps/assign-conversation"
import { type ButtonStepProps, buttonStepDefaultFn } from "../steps/button"
import { chooseChannelStepDefaultFn } from "../steps/choose-channel"
import { conditionCaseDefaultFn } from "../steps/condition"
import { removeContactTagStepDefaultFn } from "../steps/remove-contact-tag"
import { sendFileStepDefaultFn } from "../steps/send-file"
import { sendImageStepDefaultFn } from "../steps/send-image"
import { sendTextStepDefaultFn } from "../steps/send-text"
import { sendWaTemplateMessageStepDefaultFn } from "../steps/send-wa-message-template"
import {
  FieldOperationType,
  setCustomFieldStepDefaultFn,
} from "../steps/set-custom-field"
import { startExternalFlowStepDefaultFn } from "../steps/start-external-flow"
import { waitStepDefaultFn } from "../steps/wait"
import type { FlowAuthoringError, FlowAuthoringErrorCode } from "./errors"
import { closestNames, FlowAuthoringException } from "./errors"
import { type LayoutPosition, layoutNodes } from "./layout"
import type { FlowSpec, FlowStepSpec } from "./spec-schema"

/**
 * Reference data the compiler resolves DSL names against. Populated from the
 * capabilities service — kept as plain `Map`s so the compiler never touches
 * the database directly (this package has no such dependency).
 */
export type FlowAuthoringContext = {
  templatesByName: ReadonlyMap<
    string,
    { id: string; language: string; status: string }
  >
  customFieldsByName: ReadonlyMap<string, { id: string; type: string }>
  flowsByName: ReadonlyMap<string, { id: string }>
}

export type CompiledFlow = {
  startNodeId: string
  nodes: FlowVersionSchema[]
  edges: EdgeSchema[]
  /** Compiled node id -> the spec-relative path (e.g. `steps[2]`) that produced it. */
  specPathByNodeId: ReadonlyMap<string, string>
}

/** Step `type`s that end their step list — nothing may follow them. */
const TERMINAL_STEP_TYPES: ReadonlySet<FlowStepSpec["type"]> = new Set([
  "branch",
  "goto",
])

type CompileState = {
  nodes: FlowVersionSchema[]
  edges: EdgeSchema[]
  routeUpdates: FlowRouteUpdate[]
  stepIdToNodeId: Map<string, string>
  specPathByNodeId: Map<string, string>
  errors: FlowAuthoringError[]
  ctx: FlowAuthoringContext
  channel?: string
}

const addError = (
  state: CompileState,
  path: string,
  code: FlowAuthoringErrorCode,
  message: string,
  extra?: { hint?: string; candidates?: string[] },
): void => {
  state.errors.push({ path, code, message, ...extra })
}

/** Every explicit `id` a spec declares, recursively, for the pre-pass uniqueness check. */
function collectExplicitStepIds(
  steps: readonly FlowStepSpec[],
  seen: Map<string, string[]>,
  pathPrefix: string,
): void {
  steps.forEach((step, index) => {
    const stepPath = `${pathPrefix}[${index}]`
    if (step.type !== "goto" && step.id) {
      const paths = seen.get(step.id)
      if (paths) {
        paths.push(stepPath)
      } else {
        seen.set(step.id, [stepPath])
      }
    }

    if (step.type === "send") {
      step.buttons?.forEach((button, buttonIndex) => {
        if (button.then) {
          collectExplicitStepIds(
            button.then,
            seen,
            `${stepPath}.buttons[${buttonIndex}].then`,
          )
        }
      })
    }
    if (step.type === "branch") {
      step.cases.forEach((branchCase, caseIndex) => {
        collectExplicitStepIds(
          branchCase.then,
          seen,
          `${stepPath}.cases[${caseIndex}].then`,
        )
      })
      if (step.otherwise) {
        collectExplicitStepIds(step.otherwise, seen, `${stepPath}.otherwise`)
      }
    }
  })
}

function assertNoDuplicateStepIds(spec: FlowSpec, state: CompileState): void {
  const seen = new Map<string, string[]>()
  collectExplicitStepIds(spec.steps, seen, "steps")
  for (const [id, paths] of seen) {
    if (paths.length > 1) {
      for (const path of paths) {
        addError(
          state,
          path,
          "duplicateStepId",
          `Step id "${id}" is used by ${paths.length} steps; ids must be unique across the whole spec.`,
        )
      }
    }
  }
}

const registerNode = (
  state: CompileState,
  specStepId: string | undefined,
  node: FlowVersionSchema,
  stepPath: string,
): string => {
  state.nodes.push(node)
  state.specPathByNodeId.set(node.id, stepPath)
  if (specStepId) {
    state.stepIdToNodeId.set(specStepId, node.id)
  }
  return node.id
}

const addContinueEdge = (
  state: CompileState,
  source: string,
  target: string,
): void => {
  state.edges.push({
    id: createId(),
    source,
    sourceHandle: source,
    target,
    targetHandle: target,
  })
}

const addHandleEdge = (
  state: CompileState,
  source: string,
  handleId: string,
  target: string,
): void => {
  state.edges.push({
    id: createId(),
    source,
    sourceHandle: handleId,
    target,
    targetHandle: target,
  })
}

// ---- Per-step-type node builders -----------------------------------------

/** Compiles one quick-reply button: its node chain (if any), route, and edge. */
function compileSendButton(
  buttonSpec: { id?: string; text: string; then?: FlowStepSpec[] },
  sourceNodeId: string,
  buttonPath: string,
  state: CompileState,
): ButtonStepProps {
  const button = buttonStepDefaultFn({ label: buttonSpec.text })
  if (!buttonSpec.then || buttonSpec.then.length === 0) {
    return button
  }

  const entryNodeId = compileChain(buttonSpec.then, buttonPath, state)
  if (entryNodeId) {
    state.routeUpdates.push({
      sourceNodeId,
      handleId: button.id,
      route: { targetNodeId: entryNodeId },
    })
    addHandleEdge(state, sourceNodeId, button.id, entryNodeId)
  }
  return button
}

function compileSendStep(
  step: Extract<FlowStepSpec, { type: "send" }>,
  stepPath: string,
  state: CompileState,
): string {
  const node = sendMessageNodeDefaultFn({
    detailProps: {
      beforeStep: chooseChannelStepDefaultFn({
        channel: state.channel ?? "omnichannel",
      }),
    },
  })
  // Registered before compiling nested button chains so `state.nodes` keeps
  // encounter order (this node, then whatever its buttons route to) instead
  // of the reverse — `node` is a reference, so mutating its `data.details`
  // below still updates the array element already pushed.
  const nodeId = registerNode(state, step.id, node, stepPath)

  const buttons = (step.buttons ?? []).map((buttonSpec, buttonIndex) =>
    compileSendButton(
      buttonSpec,
      nodeId,
      `${stepPath}.buttons[${buttonIndex}].then`,
      state,
    ),
  )

  const contentStep = (() => {
    if (step.text) {
      return { ...sendTextStepDefaultFn({ text: step.text }), buttons }
    }
    if (step.imageUrl) {
      return { ...sendImageStepDefaultFn(), url: step.imageUrl, buttons }
    }
    return { ...sendFileStepDefaultFn(), url: step.fileUrl ?? "", buttons }
  })()

  node.data.details.steps = [contentStep]
  node.data.details.quickReplies = []

  return nodeId
}

function compileSendTemplateStep(
  step: Extract<FlowStepSpec, { type: "sendTemplate" }>,
  stepPath: string,
  state: CompileState,
): string | null {
  const template = state.ctx.templatesByName.get(step.templateName)
  if (!template) {
    addError(
      state,
      `${stepPath}.templateName`,
      "unknownTemplate",
      `No WhatsApp template named "${step.templateName}" in this workspace.`,
      {
        hint: "Call capabilities.get and pick a name from its templates list.",
        candidates: closestNames(
          step.templateName,
          state.ctx.templatesByName.keys(),
        ),
      },
    )
    return null
  }

  const templateStep = sendWaTemplateMessageStepDefaultFn({
    template: {
      id: template.id,
      name: step.templateName,
      language: template.language,
      params: {},
    },
  })

  const node = sendMessageNodeDefaultFn({
    detailProps: {
      // A WA template step only ever sends over WhatsApp — pin the channel
      // regardless of the flow's own default channel.
      beforeStep: chooseChannelStepDefaultFn({ channel: "whatsapp" }),
    },
  })
  node.data.details.steps = [templateStep]

  return registerNode(state, step.id, node, stepPath)
}

function compileWaitStep(
  step: Extract<FlowStepSpec, { type: "wait" }>,
  stepPath: string,
  state: CompileState,
): string {
  const waitStep = {
    ...waitStepDefaultFn(),
    duration: step.duration,
    unit: step.unit,
  }
  const node = waitNodeDefaultFn({})
  node.data.details.steps = [waitStep]
  return registerNode(state, step.id, node, stepPath)
}

function compileActionStep(
  step: Extract<FlowStepSpec, { type: "action" }>,
  stepPath: string,
  state: CompileState,
): string {
  const actionStep = (() => {
    switch (step.action) {
      case "addTags":
        return addContactTagStepDefaultFn({ tags: step.tagNames ?? [] })
      case "removeTags":
        return {
          ...removeContactTagStepDefaultFn(),
          tags: step.tagNames ?? [],
        }
      case "setCustomField": {
        const customField = resolveCustomField(
          step.customFieldName ?? "",
          `${stepPath}.customFieldName`,
          state,
        )
        return {
          ...setCustomFieldStepDefaultFn(),
          inputFieldId: customField?.id ?? "",
          operation: FieldOperationType.set,
          value: step.value ?? "",
        }
      }
      case "assignConversation":
        return assignConversationStepDefaultFn({
          assignedId: step.assigneeId ?? "",
        })
      case "archiveConversation":
        return archiveConversationStepDefaultFn()
      default: {
        const _exhaustive: never = step.action
        throw new Error(`Unhandled action type: ${String(_exhaustive)}`)
      }
    }
  })()

  const node = performActionNodeDefaultFn({})
  node.data.details.steps = [actionStep]
  return registerNode(state, step.id, node, stepPath)
}

function compileStartFlowStep(
  step: Extract<FlowStepSpec, { type: "startFlow" }>,
  stepPath: string,
  state: CompileState,
): string | null {
  const targetFlow = state.ctx.flowsByName.get(step.flowName)
  if (!targetFlow) {
    addError(
      state,
      `${stepPath}.flowName`,
      "unknownFlow",
      `No flow named "${step.flowName}" in this workspace.`,
      {
        hint: "Call flows.list and pick a name from the results.",
        candidates: closestNames(step.flowName, state.ctx.flowsByName.keys()),
      },
    )
    return null
  }

  const node = startFlowNodeDefaultFn({
    detailProps: {
      beforeStep: startExternalFlowStepDefaultFn({ flowId: targetFlow.id }),
    },
  })
  return registerNode(state, step.id, node, stepPath)
}

function compileAddNoteStep(
  step: Extract<FlowStepSpec, { type: "addNote" }>,
  stepPath: string,
  state: CompileState,
): string {
  const node = addNotesNodeDefaultFn({
    detailProps: { beforeStep: addNotesStepDefaultFn({ text: step.note }) },
  })
  return registerNode(state, step.id, node, stepPath)
}

const BOT_FIELD_CONDITION_PREFIX = "botField:"
const CUSTOM_FIELD_CONDITION_PREFIX = "customField:"

type BranchConditionSpec = {
  field: string
  operator: string
  value?: string | string[] | [string, string]
}

type CompiledCondition = {
  field: string
  operator: string
  value?: BranchConditionSpec["value"]
  customFieldId?: string
}

/** Resolves a workspace custom field by name, recording an `unknownCustomField` error on a miss. */
function resolveCustomField(
  name: string,
  path: string,
  state: CompileState,
): { id: string; type: string } | null {
  const customField = state.ctx.customFieldsByName.get(name)
  if (!customField) {
    addError(
      state,
      path,
      "unknownCustomField",
      `No custom field named "${name}" in this workspace.`,
      {
        hint: "Call contacts.listFilterFields and pick a custom field name from the results.",
        candidates: closestNames(name, state.ctx.customFieldsByName.keys()),
      },
    )
    return null
  }
  return customField
}

function resolveBranchCondition(
  condition: BranchConditionSpec,
  path: string,
  state: CompileState,
): CompiledCondition | null {
  if (condition.field.startsWith(BOT_FIELD_CONDITION_PREFIX)) {
    addError(
      state,
      `${path}.field`,
      "invalidSpec",
      "Bot field conditions are not supported by the flow-spec DSL yet — use a static field or 'customField:<name>'.",
    )
    return null
  }

  if (condition.field.startsWith(CUSTOM_FIELD_CONDITION_PREFIX)) {
    const name = condition.field.slice(CUSTOM_FIELD_CONDITION_PREFIX.length)
    const customField = resolveCustomField(name, `${path}.field`, state)
    if (!customField) {
      return null
    }
    return {
      field: "customField",
      customFieldId: customField.id,
      operator: condition.operator,
      value: condition.value,
    }
  }

  return {
    field: condition.field,
    operator: condition.operator,
    value: condition.value,
  }
}

function compileBranchStep(
  step: Extract<FlowStepSpec, { type: "branch" }>,
  stepPath: string,
  state: CompileState,
): string {
  const node = conditionNodeDefaultFn({})
  const conditionStep = node.data.details.steps[0]
  if (!conditionStep) {
    throw new Error("conditionNodeDefaultFn produced no condition step")
  }
  // Registered before compiling case/otherwise chains — see the identical
  // note on `compileSendStep`.
  const nodeId = registerNode(state, step.id, node, stepPath)

  conditionStep.cases = step.cases.map((branchCase, caseIndex) => {
    const caseDefault = conditionCaseDefaultFn()
    const casePath = `${stepPath}.cases[${caseIndex}]`
    const conditions = branchCase.when
      .map((condition, conditionIndex) =>
        resolveBranchCondition(
          condition,
          `${casePath}.when[${conditionIndex}]`,
          state,
        ),
      )
      .filter((value): value is CompiledCondition => value !== null)

    const entryNodeId = compileChain(branchCase.then, `${casePath}.then`, state)
    if (entryNodeId) {
      addHandleEdge(state, nodeId, caseDefault.id, entryNodeId)
    }

    return {
      ...caseDefault,
      operator: branchCase.match ?? "and",
      conditions,
    }
  })

  if (step.otherwise && step.otherwise.length > 0) {
    const entryNodeId = compileChain(
      step.otherwise,
      `${stepPath}.otherwise`,
      state,
    )
    if (entryNodeId) {
      addHandleEdge(state, nodeId, conditionStep.otherwiseId, entryNodeId)
    }
  }

  return nodeId
}

function compileGotoStep(
  step: Extract<FlowStepSpec, { type: "goto" }>,
  stepPath: string,
  state: CompileState,
): string | null {
  const targetNodeId = state.stepIdToNodeId.get(step.targetId)
  if (!targetNodeId) {
    addError(
      state,
      `${stepPath}.targetId`,
      "invalidGotoTarget",
      `"goto" targets step id "${step.targetId}", which is not an earlier step's id in this spec.`,
      {
        hint: "Set an explicit `id` on the step you want to jump to, earlier in the spec.",
      },
    )
    return null
  }
  return targetNodeId
}

function compileStep(
  step: FlowStepSpec,
  stepPath: string,
  state: CompileState,
): string | null {
  switch (step.type) {
    case "send":
      return compileSendStep(step, stepPath, state)
    case "sendTemplate":
      return compileSendTemplateStep(step, stepPath, state)
    case "wait":
      return compileWaitStep(step, stepPath, state)
    case "branch":
      return compileBranchStep(step, stepPath, state)
    case "action":
      return compileActionStep(step, stepPath, state)
    case "startFlow":
      return compileStartFlowStep(step, stepPath, state)
    case "addNote":
      return compileAddNoteStep(step, stepPath, state)
    case "goto":
      return compileGotoStep(step, stepPath, state)
    default: {
      const _exhaustive: never = step
      throw new Error(`Unhandled step type: ${(step as FlowStepSpec).type}`)
    }
  }
}

/**
 * Compiles a step list into a chain of nodes wired by "Continue" edges
 * (`sourceHandle` = the source node's own id, per the handle-id convention),
 * and returns the entry point — the id of its first node, or (when the list
 * opens with `goto`) the id of the existing node it jumps to. `null` only
 * for an empty list.
 */
function compileChain(
  steps: readonly FlowStepSpec[],
  pathPrefix: string,
  state: CompileState,
): string | null {
  let previousNodeId: string | null = null
  let previousStepWasTerminal = false
  let entryNodeId: string | null = null

  steps.forEach((step, index) => {
    const stepPath = `${pathPrefix}[${index}]`
    const isTerminal = TERMINAL_STEP_TYPES.has(step.type)

    if (index < steps.length - 1 && isTerminal) {
      addError(
        state,
        `${pathPrefix}[${index + 1}]`,
        "unreachableStep",
        `Step ${index + 2} of ${steps.length} can never run — "${step.type}" at step ${index + 1} ends its step list.`,
        {
          hint: "Move the following steps inside this step's own branch (e.g. a branch case's `then`) or delete them.",
        },
      )
    }

    const nodeId = compileStep(step, stepPath, state)
    if (nodeId !== null) {
      if (entryNodeId === null) {
        entryNodeId = nodeId
      }
      if (previousNodeId && !previousStepWasTerminal) {
        addContinueEdge(state, previousNodeId, nodeId)
      }
      previousNodeId = nodeId
    }
    previousStepWasTerminal = isTerminal
  })

  return entryNodeId
}

/**
 * Applies a computed position and `isStartNode` flag while preserving the
 * node's exact discriminated-union member type. A plain `{ ...node, ... }`
 * spread over a `FlowVersionSchema` (a 9-member discriminated union) loses
 * the correlation TS needs between `type` and the rest of the shape — this
 * generic keeps `T` bound to the caller's already-narrowed member type
 * instead of re-widening to the full union.
 */
function withLayoutPosition<T extends FlowVersionSchema>(
  node: T,
  position: LayoutPosition,
  isStartNode: boolean,
): T {
  return { ...node, position, data: { ...node.data, isStartNode } }
}

/**
 * Compiles a `flowSpecSchema`-shaped spec into `{ startNodeId, nodes, edges }`
 * ready for `publishFlowSchema.parse` / `flowVersionService.publish`.
 *
 * Every node comes from its canonical `*NodeDefaultFn` so it can never drift
 * from the builder's own defaults (position/measured are overwritten by
 * `layoutNodes` afterward; everything else — `data`, default sub-steps — is
 * exactly what the builder itself would create). Button routing is never
 * hand-assembled: routes are collected as `FlowRouteUpdate`s and applied in
 * one call to `applyRouteUpdatesInNodes`, the same helper the builder UI
 * uses, so a future change to how routes are stored is picked up here for
 * free.
 *
 * Throws `FlowAuthoringException` (never a partial result) when compilation
 * hits any error — reference-name lookups, duplicate ids, or structural
 * issues (an unreachable step, a `goto` to an unknown id). Every error found
 * is collected before throwing, not just the first.
 */
export function compileFlowSpec(
  spec: FlowSpec,
  ctx: FlowAuthoringContext,
): CompiledFlow {
  const state: CompileState = {
    nodes: [],
    edges: [],
    routeUpdates: [],
    stepIdToNodeId: new Map(),
    specPathByNodeId: new Map(),
    errors: [],
    ctx,
    channel: spec.channel,
  }

  assertNoDuplicateStepIds(spec, state)

  if (spec.steps[0]?.type === "goto") {
    addError(
      state,
      "steps[0]",
      "invalidFirstStep",
      '"goto" cannot be the first step — there is no earlier step yet to jump from.',
    )
  }

  const startNodeId = compileChain(spec.steps, "steps", state)

  if (state.errors.length > 0) {
    throw new FlowAuthoringException(state.errors)
  }

  if (!startNodeId) {
    throw new FlowAuthoringException([
      {
        path: "steps",
        code: "compileFailed",
        message: "Compilation produced no nodes.",
      },
    ])
  }

  // `state.nodes` are `FlowVersionSchema` (this package's compiler-output
  // type); `applyRouteUpdatesInNodes` operates on reactflow's generic
  // `FlowNode = Node<FlowVersionSchema["data"]>`, a structurally different
  // shape (position/measured/type are generic there, not the discriminated
  // union). The double cast crosses that boundary; node `id`s — what
  // `specPathByNodeId` keys on below — are preserved through it either way.
  const routedNodes = applyRouteUpdatesInNodes(
    state.nodes as unknown as FlowNode[],
    state.routeUpdates,
  ) as unknown as FlowVersionSchema[]

  const positions = layoutNodes(
    routedNodes.map((node) => node.id),
    state.edges,
    startNodeId,
  )

  const nodes = routedNodes.map((node, index) =>
    withLayoutPosition(
      node,
      positions.get(node.id) ?? node.position,
      index === 0 && node.id === startNodeId,
    ),
  )

  return {
    startNodeId,
    nodes,
    edges: state.edges,
    specPathByNodeId: state.specPathByNodeId,
  }
}
