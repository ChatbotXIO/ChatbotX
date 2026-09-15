import { createId } from "@chatbotx.io/utils"
import { addNotesNodeDefaultFn } from "../nodes/add-notes"
import { conditionNodeDefaultFn } from "../nodes/condition"
import type { EdgeSchema, FlowVersionSchema } from "../nodes/index"
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
import {
  conditionCaseDefaultFn,
  conditionStepDefaultFn,
} from "../steps/condition"
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

/** Whether a step ends its step list — nothing may follow it. */
const ENDS_STEP_LIST: Record<FlowStepSpec["type"], boolean> = {
  send: false,
  sendTemplate: false,
  wait: false,
  branch: true,
  action: false,
  startFlow: false,
  addNote: false,
  goto: true,
}

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

type ResolveByNameOptions = {
  code: FlowAuthoringErrorCode
  label: string
  hint: string
}

type ChildChain = {
  steps: readonly FlowStepSpec[]
  pathSuffix: string
}

const TEMPLATE_NAME_RESOLUTION = {
  code: "unknownTemplate",
  label: "WhatsApp template",
  hint: "Call capabilities.get and pick a name from its templates list.",
} as const satisfies ResolveByNameOptions

const FLOW_NAME_RESOLUTION = {
  code: "unknownFlow",
  label: "flow",
  hint: "Call flows.list and pick a name from the results.",
} as const satisfies ResolveByNameOptions

const CUSTOM_FIELD_NAME_RESOLUTION = {
  code: "unknownCustomField",
  label: "custom field",
  hint: "Call contacts.listFilterFields and pick a custom field name from the results.",
} as const satisfies ResolveByNameOptions

// Matches the WhatsApp template status enum in
// packages/database/src/partials/integration-whatsapp.ts.
const APPROVED_TEMPLATE_STATUS = "APPROVED"

const addError = (
  state: CompileState,
  path: string,
  code: FlowAuthoringErrorCode,
  message: string,
  extra?: { hint?: string; candidates?: string[] },
): void => {
  state.errors.push({ path, code, message, ...extra })
}

function resolveByName<T>(
  state: CompileState,
  map: ReadonlyMap<string, T>,
  name: string,
  path: string,
  { code, label, hint }: ResolveByNameOptions,
): T | null {
  const value = map.get(name)
  if (!value) {
    addError(
      state,
      path,
      code,
      `No ${label} named "${name}" in this workspace.`,
      { hint, candidates: closestNames(name, map.keys()) },
    )
    return null
  }
  return value
}

/**
 * Nested step lists owned by one step, with their path relative to that step.
 * The compiler itself cannot consume this directly because it needs each
 * child's handle id while it compiles the child chain.
 */
function childChains(step: FlowStepSpec): ChildChain[] {
  switch (step.type) {
    case "send":
      return (step.buttons ?? []).flatMap((button, index) =>
        button.then
          ? [{ steps: button.then, pathSuffix: `.buttons[${index}].then` }]
          : [],
      )
    case "branch":
      return [
        ...step.cases.map((branchCase, index) => ({
          steps: branchCase.then,
          pathSuffix: `.cases[${index}].then`,
        })),
        ...(step.otherwise
          ? [{ steps: step.otherwise, pathSuffix: ".otherwise" }]
          : []),
      ]
    case "sendTemplate":
    case "wait":
    case "action":
    case "startFlow":
    case "addNote":
    case "goto":
      return []
    default: {
      const _exhaustive: never = step
      return _exhaustive
    }
  }
}

/** Every explicit `id` a spec declares, recursively, for the pre-pass uniqueness check. */
function explicitStepIds(
  steps: readonly FlowStepSpec[],
  pathPrefix: string,
): Array<{ id: string; path: string }> {
  return steps.flatMap((step, index) => {
    const stepPath = `${pathPrefix}[${index}]`
    return [
      ...(step.type !== "goto" && step.id
        ? [{ id: step.id, path: stepPath }]
        : []),
      ...childChains(step).flatMap(({ steps: childSteps, pathSuffix }) =>
        explicitStepIds(childSteps, `${stepPath}${pathSuffix}`),
      ),
    ]
  })
}

function assertNoDuplicateStepIds(spec: FlowSpec, state: CompileState): void {
  const seen = new Map<string, string[]>()
  for (const { id, path } of explicitStepIds(spec.steps, "steps")) {
    const paths = seen.get(id)
    if (paths) {
      paths.push(path)
    } else {
      seen.set(id, [path])
    }
  }

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

/**
 * Makes `specStepId` resolvable by `goto` before this step's own node exists
 * in `state.nodes` — a step's children (a button's `then`, a branch case's
 * `then`) compile before `registerNode` runs, so a `goto` back to the step
 * that contains them (e.g. a "Back to menu" button on the same send step)
 * would otherwise find nothing in `stepIdToNodeId` yet. Idempotent with
 * `registerNode`'s own `stepIdToNodeId.set` below — both just point the id
 * at the same, already-known `nodeId`.
 */
const preregisterStepId = (
  state: CompileState,
  specStepId: string | undefined,
  nodeId: string,
): void => {
  if (specStepId) {
    state.stepIdToNodeId.set(specStepId, nodeId)
  }
}

const registerNode = (
  state: CompileState,
  specStepId: string | undefined,
  node: FlowVersionSchema,
  stepPath: string,
  options?: { insertAt?: number },
): string => {
  if (options?.insertAt === undefined) {
    state.nodes.push(node)
  } else {
    state.nodes.splice(options.insertAt, 0, node)
  }
  state.specPathByNodeId.set(node.id, stepPath)
  preregisterStepId(state, specStepId, node.id)
  return node.id
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

const addContinueEdge = (
  state: CompileState,
  source: string,
  target: string,
): void => addHandleEdge(state, source, source, target)

type NodeWithSteps = Extract<
  FlowVersionSchema,
  { data: { details: { steps: unknown[] } } }
>

const withSteps = <T extends NodeWithSteps>(
  node: T,
  steps: T["data"]["details"]["steps"],
): T => ({
  ...node,
  data: {
    ...node.data,
    details: { ...node.data.details, steps },
  },
})

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
  const nodeId = createId()
  const insertAt = state.nodes.length
  // Before compiling buttons: a button's `then` can `goto` back to this same
  // send step (e.g. "Back to menu"), which only resolves if the id is
  // already registered when that nested `compileChain` runs.
  preregisterStepId(state, step.id, nodeId)
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
  const node = withSteps(
    sendMessageNodeDefaultFn({
      nodeProps: { id: nodeId },
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({
          channel: state.channel ?? "omnichannel",
        }),
      },
    }),
    [contentStep],
  )

  return registerNode(state, step.id, node, stepPath, { insertAt })
}

function compileSendTemplateStep(
  step: Extract<FlowStepSpec, { type: "sendTemplate" }>,
  stepPath: string,
  state: CompileState,
): string | null {
  const template = resolveByName(
    state,
    state.ctx.templatesByName,
    step.templateName,
    `${stepPath}.templateName`,
    TEMPLATE_NAME_RESOLUTION,
  )
  if (!template) {
    return null
  }
  if (template.status !== APPROVED_TEMPLATE_STATUS) {
    addError(
      state,
      `${stepPath}.templateName`,
      "templateNotApproved",
      `WhatsApp template "${step.templateName}" must have status APPROVED.`,
      {
        hint: "Pick a template whose status is APPROVED in capabilities.get's templates list.",
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
  const node = withSteps(
    sendMessageNodeDefaultFn({
      detailProps: {
        // A WA template step only ever sends over WhatsApp — pin the channel
        // regardless of the flow's own default channel.
        beforeStep: chooseChannelStepDefaultFn({ channel: "whatsapp" }),
      },
    }),
    [templateStep],
  )

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
  return registerNode(
    state,
    step.id,
    withSteps(waitNodeDefaultFn({}), [waitStep]),
    stepPath,
  )
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

  return registerNode(
    state,
    step.id,
    withSteps(performActionNodeDefaultFn({}), [actionStep]),
    stepPath,
  )
}

function compileStartFlowStep(
  step: Extract<FlowStepSpec, { type: "startFlow" }>,
  stepPath: string,
  state: CompileState,
): string | null {
  const targetFlow = resolveByName(
    state,
    state.ctx.flowsByName,
    step.flowName,
    `${stepPath}.flowName`,
    FLOW_NAME_RESOLUTION,
  )
  if (!targetFlow) {
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
  return resolveByName(
    state,
    state.ctx.customFieldsByName,
    name,
    path,
    CUSTOM_FIELD_NAME_RESOLUTION,
  )
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
  const nodeId = createId()
  const insertAt = state.nodes.length
  const otherwiseId = createId()
  // Before compiling cases/otherwise: a case's `then` can `goto` back to
  // this same branch step, which only resolves if the id is already
  // registered when that nested `compileChain` runs.
  preregisterStepId(state, step.id, nodeId)
  const cases = step.cases.map((branchCase, caseIndex) => {
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
      addHandleEdge(state, nodeId, otherwiseId, entryNodeId)
    }
  }

  const node = withSteps(
    conditionNodeDefaultFn({ nodeProps: { id: nodeId } }),
    [conditionStepDefaultFn({ cases, otherwiseId })],
  )
  return registerNode(state, step.id, node, stepPath, { insertAt })
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
    const isTerminal = ENDS_STEP_LIST[step.type]

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
        // `compileGotoStep` creates no node of its own — it returns the
        // existing target node's id. If that target is the step immediately
        // before it, `nodeId === previousNodeId` and a continue edge would
        // wire a node to itself (`source === target`), a degenerate
        // self-loop `layoutNodes` can't position. Reject it as a compile
        // error instead of silently emitting it.
        if (nodeId === previousNodeId) {
          addError(
            state,
            stepPath,
            "selfLoopGoto",
            '"goto" targets the immediately preceding step, which would create a self-loop edge.',
            {
              hint: 'Target an earlier step, or remove this "goto" — the flow already continues into the preceding step by default.',
            },
          )
        } else {
          addContinueEdge(state, previousNodeId, nodeId)
        }
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

const createCompileState = (
  spec: FlowSpec,
  ctx: FlowAuthoringContext,
): CompileState => ({
  nodes: [],
  edges: [],
  routeUpdates: [],
  stepIdToNodeId: new Map(),
  specPathByNodeId: new Map(),
  errors: [],
  ctx,
  channel: spec.channel,
})

const validateStructure = (spec: FlowSpec, state: CompileState): void => {
  assertNoDuplicateStepIds(spec, state)

  if (spec.steps[0]?.type === "goto") {
    addError(
      state,
      "steps[0]",
      "invalidFirstStep",
      '"goto" cannot be the first step — there is no earlier step yet to jump from.',
    )
  }
}

const finalizeGraph = (
  state: CompileState,
  startNodeId: string | null,
): CompiledFlow => {
  // `flowSpecSchema` requires steps, but a TypeScript caller can bypass parsing
  // and pass `steps: []`; the finalized graph must still have a start node.
  if (!startNodeId) {
    throw new FlowAuthoringException([
      {
        path: "steps",
        code: "compileFailed",
        message: "Compilation produced no nodes.",
      },
    ])
  }

  const routedNodes = applyRouteUpdatesInNodes(state.nodes, state.routeUpdates)
  const positions = layoutNodes(
    routedNodes.map((node) => node.id),
    state.edges,
    startNodeId,
  )
  const nodes = routedNodes.map((node) =>
    withLayoutPosition(
      node,
      positions.get(node.id) ?? node.position,
      node.id === startNodeId,
    ),
  )

  return {
    startNodeId,
    nodes,
    edges: state.edges,
    specPathByNodeId: state.specPathByNodeId,
  }
}

/**
 * Compiles a `flowSpecSchema`-shaped spec into `{ startNodeId, nodes, edges }`
 * ready for `publishFlowSchema.parse` / `flowVersionService.publish`.
 *
 * Every node comes from its canonical `*NodeDefaultFn` so it can never drift
 * from the builder's own defaults (only `position` is overwritten by
 * `layoutNodes`; `measured`, `data`, and default sub-steps are exactly what
 * the builder itself would create). Button routing is never hand-assembled:
 * routes are collected as `FlowRouteUpdate`s and applied in one call to
 * `applyRouteUpdatesInNodes`, the same helper the builder UI uses, so a
 * future change to how routes are stored is picked up here for free.
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
  const state = createCompileState(spec, ctx)
  validateStructure(spec, state)
  const startNodeId = compileChain(spec.steps, "steps", state)

  if (state.errors.length > 0) {
    throw new FlowAuthoringException(state.errors)
  }

  return finalizeGraph(state, startNodeId)
}
