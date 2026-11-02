import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  flowRepository,
  pipelineReferenceRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import { isBigintId } from "@chatbotx.io/database/utils"
import {
  FieldReferenceKind,
  type PipelineStepAction,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import { stableStringify } from "../audit/diff"
import { botFieldService } from "../bot-field/service"
import { customFieldService } from "../custom-field/service"
import { tagService } from "../tag/service"

type ActionReference =
  | { kind: "flow"; id: string }
  | { kind: "flowNode"; flowId: string; id: string }
  | { kind: "tag"; id: string }
  | { kind: "customField"; id: string }
  /** An id or a name: the trigger runtime resolves both. */
  | { kind: "customFieldKey"; id: string }
  | { kind: "botField"; id: string }
  | { kind: "pipeline"; id: string }
  | { kind: "pipelineStage"; pipelineId: string; id: string }
  | { kind: "pipelineField"; pipelineId: string; id: string }
  | { kind: "workspaceMember"; id: string }
  | { kind: "inboxTeam"; id: string }

/** One reference an action holds, and the property that holds it (`stageId`, `fieldValues.0.pipelineFieldId`). */
type ReferenceUse = { field: string; reference: ActionReference }

/** A reference that does not resolve in the workspace: `actions.<index>.<field>`. */
export type ActionReferenceProblem = { index: number; field: string }

type ActionRecord = Record<string, unknown>

/** What the caller's runtime accepts, which decides what is a valid reference. */
type CollectOptions = {
  /** `setCustomField` may name its field (triggers) or must give an id (inbound webhooks). */
  fieldNames: boolean
}
/** A collector that does not depend on what the runtime accepts. */
type ActionReferenceCollector = (action: ActionRecord) => ReferenceUse[]
type ReferenceCollector = (
  action: ActionRecord,
  options: CollectOptions,
) => ReferenceUse[]

const asText = (value: unknown): string => String(value ?? "")
const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : []

/**
 * A reference to check. An empty id is a missing required reference (reported);
 * only a slot that is optional may be left empty (`optional`).
 */
const used = (
  field: string,
  value: unknown,
  toReference: (id: string) => ActionReference,
  optional = false,
): ReferenceUse[] => {
  const id = asText(value)
  return id === "" && optional ? [] : [{ field, reference: toReference(id) }]
}

const usedEach = (
  field: string,
  values: unknown,
  toReference: (id: string) => ActionReference,
): ReferenceUse[] =>
  asArray(values).flatMap((value, position) =>
    used(`${field}.${position}`, value, toReference),
  )

const collectTags: ReferenceCollector = (action) =>
  usedEach("tagIds", action.tagIds, (id) => ({ kind: "tag", id }))

const customFieldReference = (
  action: ActionRecord,
  nameKind: "customField" | "customFieldKey",
): ReferenceUse[] => {
  const reference = parseFieldReference(asText(action.customFieldId))
  if (reference.kind === FieldReferenceKind.botField) {
    return [
      {
        field: "customFieldId",
        reference: { kind: "botField", id: reference.id },
      },
    ]
  }
  return [
    {
      field: "customFieldId",
      reference: { kind: nameKind, id: reference.key },
    },
  ]
}

/** Setting a field: a trigger may name it, so only an inbound webhook needs an id. */
const collectSetFieldReference: ReferenceCollector = (action, options) =>
  customFieldReference(
    action,
    options.fieldNames ? "customFieldKey" : "customField",
  )

/** Clearing deletes by id in every runtime, so a name is never valid. */
const collectClearFieldReference: ReferenceCollector = (action) =>
  customFieldReference(action, "customField")

const collectDueDate = (dueDate: unknown): ReferenceUse[] => {
  const due = (dueDate ?? {}) as ActionRecord
  return due.mode === "customField"
    ? used(
        "dueDate.customFieldId",
        due.customFieldId,
        (id) => ({ kind: "customField", id }),
        true,
      )
    : []
}

const collectAssignees = (action: ActionRecord): ReferenceUse[] => [
  ...usedEach("assigneeMemberIds", action.assigneeMemberIds, (id) => ({
    kind: "workspaceMember",
    id,
  })),
  ...usedEach("assigneeInboxTeamIds", action.assigneeInboxTeamIds, (id) => ({
    kind: "inboxTeam",
    id,
  })),
]

const stageOf =
  (field: string, pipelineKey: string, optional = false) =>
  (action: ActionRecord): ReferenceUse[] =>
    used(
      field,
      action[field],
      (id) => ({
        kind: "pipelineStage",
        pipelineId: asText(action[pipelineKey]),
        id,
      }),
      optional,
    )

const noReferences: ActionReferenceCollector = () => []

/** What each pipeline action points at beyond its own pipeline. */
const PIPELINE_COLLECTORS: Record<
  PipelineStepAction,
  ActionReferenceCollector
> = {
  addToPipeline: (action) => [
    ...stageOf("stageId", "pipelineId", true)(action),
    ...collectAssignees(action),
    ...collectDueDate(action.dueDate),
    ...asArray(action.fieldValues).flatMap((entry, position) =>
      used(
        `fieldValues.${position}.pipelineFieldId`,
        (entry as ActionRecord).pipelineFieldId,
        (id) => ({
          kind: "pipelineField",
          pipelineId: asText(action.pipelineId),
          id,
        }),
      ),
    ),
  ],
  moveToStage: stageOf("stageId", "pipelineId"),
  changeValue: noReferences,
  assign: collectAssignees,
  changeStatus: noReferences,
  changePriority: noReferences,
  changeDueDate: (action) => collectDueDate(action.dueDate),
  changeTitle: noReferences,
  setCustomField: (action) =>
    used(
      "pipelineFieldId",
      action.pipelineFieldId,
      (id) => ({
        kind: "pipelineField",
        pipelineId: asText(action.pipelineId),
        id,
      }),
      true,
    ),
  clearCustomField: (action) =>
    usedEach("pipelineFieldIds", action.pipelineFieldIds, (id) => ({
      kind: "pipelineField",
      pipelineId: asText(action.pipelineId),
      id,
    })),
  changeDescription: noReferences,
  removeFromPipeline: noReferences,
  addComment: noReferences,
  transfer: (action) => [
    ...used("destinationPipelineId", action.destinationPipelineId, (id) => ({
      kind: "pipeline",
      id,
    })),
    // The destination stage belongs to the destination pipeline.
    ...stageOf("destinationStageId", "destinationPipelineId", true)(action),
  ],
}

const collectPipeline: ReferenceCollector = (action) => {
  const collect = PIPELINE_COLLECTORS[action.action as PipelineStepAction]
  return [
    ...used("pipelineId", action.pipelineId, (id) => ({
      kind: "pipeline",
      id,
    })),
    ...(collect ? collect(action) : []),
  ]
}

/**
 * The workspace-owned records each action type points at. Keyed by action type,
 * so a new action only has to say what it references (or nothing).
 */
const COLLECTORS: Partial<Record<string, ReferenceCollector>> = {
  startAnotherFlow: (action) =>
    used("flowId", action.flowId, (id) => ({ kind: "flow", id })),
  startExternalStep: (action) => [
    ...used("flowId", action.flowId, (id) => ({ kind: "flow", id })),
    ...used("nodeId", action.nodeId, (id) => ({
      kind: "flowNode",
      flowId: asText(action.flowId),
      id,
    })),
  ],
  addTag: collectTags,
  removeTag: collectTags,
  setCustomField: collectSetFieldReference,
  clearCustomField: collectClearFieldReference,
  pipeline: collectPipeline,
}

const idsOf = (
  uses: ReferenceUse[],
  kind: ActionReference["kind"],
): string[] => [
  ...new Set(
    uses
      .filter((use) => use.reference.kind === kind)
      .map((use) => use.reference.id),
  ),
]

type ExistingReferences = {
  flows: Set<string>
  flowNodes: Map<string, Set<string>>
  tags: Set<string>
  customFields: Set<string>
  customFieldKeys: Set<string>
  botFields: Set<string>
  pipelines: Set<string>
  stagesByPipeline: Map<string, Set<string>>
  fieldsByPipeline: Map<string, Set<string>>
  members: Set<string>
  teams: Set<string>
}

/** Names are free text; every other reference must be an id that can exist. */
const wellFormed = (uses: ReferenceUse[]): ReferenceUse[] =>
  uses.filter(({ reference }) => {
    if (reference.kind === "customFieldKey") {
      return reference.id !== ""
    }
    // An id too large for a bigint would make Postgres reject the whole lookup.
    return (
      isBigintId(reference.id) &&
      !("flowId" in reference && !isBigintId(reference.flowId)) &&
      !("pipelineId" in reference && !isBigintId(reference.pipelineId))
    )
  })

const pipelineIdsOf = (reference: ActionReference): string[] => {
  if (reference.kind === "pipeline") {
    return [reference.id]
  }
  return "pipelineId" in reference ? [reference.pipelineId] : []
}

const groupIdsBy = <Row extends { id: string; pipelineId: string }>(
  rows: Row[],
): Map<string, Set<string>> => {
  const grouped = new Map<string, Set<string>>()
  for (const row of rows) {
    const ids = grouped.get(row.pipelineId) ?? new Set<string>()
    ids.add(row.id)
    grouped.set(row.pipelineId, ids)
  }
  return grouped
}

/**
 * One lookup per kind of record, for the well-formed references only, on the
 * caller's transaction when given (a save holds a connection and must not wait
 * for a second one).
 */
const loadExisting = async (
  workspaceId: string,
  uses: ReferenceUse[],
  tx?: DatabaseClient,
): Promise<ExistingReferences> => {
  const nodeFlowIds = [
    ...new Set(
      uses.flatMap(({ reference }) =>
        reference.kind === "flowNode" ? [reference.flowId] : [],
      ),
    ),
  ]
  const pipelineIds = [
    ...new Set(uses.flatMap(({ reference }) => pipelineIdsOf(reference))),
  ]
  const stagePipelineIds = [
    ...new Set(
      uses.flatMap(({ reference }) =>
        reference.kind === "pipelineStage" ? [reference.pipelineId] : [],
      ),
    ),
  ]
  const fieldPipelineIds = [
    ...new Set(
      uses.flatMap(({ reference }) =>
        reference.kind === "pipelineField" ? [reference.pipelineId] : [],
      ),
    ),
  ]
  const flowIds = idsOf(uses, "flow")

  const [
    flowIdRows,
    flowNodeRows,
    tags,
    customFields,
    customFieldKeys,
    botFields,
    pipelines,
    members,
    teams,
    stages,
    fields,
  ] = await Promise.all([
    flowIds.length
      ? flowRepository.listIdsByIds({ workspaceId, ids: flowIds }, tx)
      : [],
    // The node documents are only worth loading for a reference that names a node.
    nodeFlowIds.length
      ? flowRepository.listCurrentVersionNodesByFlowIds(
          { workspaceId, flowIds: nodeFlowIds },
          tx,
        )
      : [],
    tagService.findManyByIds({ workspaceId, ids: idsOf(uses, "tag"), tx }),
    customFieldService.findManyByIds({
      workspaceId,
      ids: idsOf(uses, "customField"),
      tx,
    }),
    customFieldService.findManyByKeys({
      workspaceId,
      keys: idsOf(uses, "customFieldKey"),
      tx,
    }),
    botFieldService.findManyByIds({
      workspaceId,
      ids: idsOf(uses, "botField"),
      tx,
    }),
    Promise.all(
      pipelineIds.map((id) =>
        pipelineRepository.findById({ workspaceId, id }, tx),
      ),
    ),
    pipelineReferenceRepository.listWorkspaceMembers(
      { workspaceId, ids: idsOf(uses, "workspaceMember") },
      tx,
    ),
    pipelineReferenceRepository.listInboxTeamIds(
      { workspaceId, ids: idsOf(uses, "inboxTeam") },
      tx,
    ),
    pipelineStageRepository.listByPipelineIds(
      { workspaceId, pipelineIds: stagePipelineIds },
      tx,
    ),
    pipelineRepository.listFieldsByPipelineIds(
      { workspaceId, pipelineIds: fieldPipelineIds },
      tx,
    ),
  ])

  return {
    flows: new Set(flowIdRows),
    flowNodes: new Map(
      flowNodeRows.map((flow) => [
        flow.flowId,
        new Set(flow.nodes.map((node) => node.id)),
      ]),
    ),
    tags: new Set(tags.map((tag) => tag.id)),
    customFields: new Set(customFields.map((field) => field.id)),
    customFieldKeys: new Set(customFieldKeys.keys()),
    botFields: new Set(botFields.map((field) => field.id)),
    pipelines: new Set(
      pipelines.flatMap((pipeline) => (pipeline ? [pipeline.id] : [])),
    ),
    stagesByPipeline: groupIdsBy(stages),
    fieldsByPipeline: groupIdsBy(fields),
    members: new Set(members.map((member) => member.id)),
    teams: new Set(teams),
  }
}

const RESOLVERS: {
  [Kind in ActionReference["kind"]]: (
    reference: Extract<ActionReference, { kind: Kind }>,
    existing: ExistingReferences,
  ) => boolean
} = {
  flow: (reference, existing) => existing.flows.has(reference.id),
  flowNode: (reference, existing) =>
    existing.flowNodes.get(reference.flowId)?.has(reference.id) ?? false,
  tag: (reference, existing) => existing.tags.has(reference.id),
  customField: (reference, existing) => existing.customFields.has(reference.id),
  customFieldKey: (reference, existing) =>
    existing.customFieldKeys.has(reference.id),
  botField: (reference, existing) => existing.botFields.has(reference.id),
  pipeline: (reference, existing) => existing.pipelines.has(reference.id),
  pipelineStage: (reference, existing) =>
    existing.stagesByPipeline.get(reference.pipelineId)?.has(reference.id) ??
    false,
  pipelineField: (reference, existing) =>
    existing.fieldsByPipeline.get(reference.pipelineId)?.has(reference.id) ??
    false,
  workspaceMember: (reference, existing) => existing.members.has(reference.id),
  inboxTeam: (reference, existing) => existing.teams.has(reference.id),
}

const resolves = (
  reference: ActionReference,
  existing: ExistingReferences,
): boolean =>
  (
    RESOLVERS[reference.kind] as (
      reference: ActionReference,
      existing: ExistingReferences,
    ) => boolean
  )(reference, existing)

/**
 * The references of `actions` that do not resolve in the workspace, each as
 * `actions.<index>.<field>`. Ids that cannot exist (empty, or not all digits)
 * are reported without a query, since Postgres would reject the whole lookup.
 * `indexes` limits the check to some actions (the new ones on an update);
 * `fieldNames` says whether `setCustomField` may name its field (triggers) or
 * must give an id (inbound webhooks); `tx` runs the lookups on a caller's
 * transaction.
 */
export const findInvalidActionReferences = async (input: {
  workspaceId: string
  actions: readonly ActionRecord[]
  indexes?: ReadonlySet<number>
  fieldNames?: boolean
  tx?: DatabaseClient
}): Promise<ActionReferenceProblem[]> => {
  const options: CollectOptions = { fieldNames: input.fieldNames ?? false }
  const entries = input.actions.flatMap((action, index) =>
    input.indexes && !input.indexes.has(index)
      ? []
      : (COLLECTORS[asText(action.type)]?.(action, options) ?? []).map(
          (use) => ({ index, use }),
        ),
  )
  if (entries.length === 0) {
    return []
  }
  const good = new Set(wellFormed(entries.map((entry) => entry.use)))
  const existing = await loadExisting(input.workspaceId, [...good], input.tx)

  return entries.flatMap(({ index, use }) =>
    good.has(use) && resolves(use.reference, existing)
      ? []
      : [{ index, field: use.field }],
  )
}

/**
 * Positions in `next` of the actions that are not already stored. Compared as
 * a multiset, so reordering or inserting actions never re-validates the
 * grandfathered ones, while a second copy of an existing action counts as new.
 */
export const indexesOfNewActions = (
  next: readonly unknown[],
  stored: readonly unknown[],
): Set<number> => {
  const remaining = new Map<string, number>()
  for (const action of stored) {
    const key = stableStringify(action)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }
  const fresh = new Set<number>()
  next.forEach((action, index) => {
    const key = stableStringify(action)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
    } else {
      fresh.add(index)
    }
  })
  return fresh
}
