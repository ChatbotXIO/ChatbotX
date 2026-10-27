import { PIPELINE_LIMITS } from "@chatbotx.io/database/partials"
import {
  pipelineReferenceRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import { isBigintId } from "@chatbotx.io/database/utils"
import type {
  PipelineStepAction,
  PipelineStepDueDate,
  PipelineStepOf,
  PipelineStepSchema,
} from "@chatbotx.io/flow-config"
import { isTemporalCustomFieldType } from "@chatbotx.io/utils/datetime"
import { contactCustomFieldValueService } from "../contact-custom-field/value-service"
import { customFieldService } from "../custom-field/service"
import { ChatbotXException, validationException } from "../errors"
import { logger } from "../logger"
import type { PipelineAccessScope } from "./access"
import { pipelineItemService } from "./item.service"
import { pipelineItemContentService } from "./item-content.service"
import type { PipelineActor } from "./types"

/** Flow steps are system context: the workspace owns the pipeline, not a member. */
const FLOW_SCOPE: PipelineAccessScope = { kind: "system" }
const FALLBACK_TITLE = "Untitled"
const PIPELINE_MISSING_MESSAGE = "The pipeline does not exist in this workspace"

type PipelineFlowActionStatus = "success" | "error" | "skip"

export type PipelineFlowActionResult = {
  status: PipelineFlowActionStatus
  /** Why the step errored or skipped; written to logs, never shown to the contact. */
  message?: string
}

export type PipelineFlowActionContext = {
  workspaceId: string
  contactId: string
  flowId: string
  /** Stable per flow run; present only when the executor supplied one. */
  flowExecutionKey?: string
  /** Resolves `{{variables}}` for the chatting contact. */
  interpolate: (text: string) => Promise<string>
}

type ActionEnv = {
  ctx: PipelineFlowActionContext
  actor: PipelineActor
  pipelineId: string
  /** Dedup key for the one action per step that must not repeat on a retry. */
  idempotencyKey: string | undefined
}

type TargetItem = NonNullable<
  Awaited<ReturnType<typeof pipelineItemService.resolveTargetForContact>>
>

type ActionHandler<A extends PipelineStepAction> = (
  step: PipelineStepOf<A>,
  env: ActionEnv,
) => Promise<PipelineFlowActionResult>

type TargetActionHandler<A extends PipelineStepAction> = (
  step: PipelineStepOf<A>,
  env: ActionEnv,
  target: TargetItem,
) => Promise<void>

const success: PipelineFlowActionResult = { status: "success" }
const fail = (message: string): PipelineFlowActionResult => ({
  status: "error",
  message,
})
const skipped = (message: string): PipelineFlowActionResult => ({
  status: "skip",
  message,
})

/** Contact-scoped actions run against the contact's latest open item; none means skip. */
const onTarget =
  <A extends PipelineStepAction>(
    run: TargetActionHandler<A>,
  ): ActionHandler<A> =>
  async (step, env) => {
    const target = await pipelineItemService.resolveTargetForContact({
      workspaceId: env.ctx.workspaceId,
      pipelineId: env.pipelineId,
      contactId: env.ctx.contactId,
    })
    if (!target) {
      // Only the miss path pays for the existence check: a deleted pipeline
      // routes to error, a pipeline the contact simply is not in to skip.
      const pipeline = await pipelineRepository.findById({
        workspaceId: env.ctx.workspaceId,
        id: env.pipelineId,
      })
      return pipeline
        ? skipped("The contact has no open item in this pipeline")
        : fail(PIPELINE_MISSING_MESSAGE)
    }
    await run(step, env, target)
    return success
  }

const updateTarget = (
  env: ActionEnv,
  target: TargetItem,
  fields: Parameters<typeof pipelineItemService.update>[0]["fields"],
) =>
  pipelineItemService.update({
    workspaceId: env.ctx.workspaceId,
    pipelineId: env.pipelineId,
    itemId: target.id,
    fields,
    scope: FLOW_SCOPE,
    actor: env.actor,
  })

const parseValue = (raw: string): number => {
  const trimmed = raw.trim()
  const parsed = trimmed === "" ? Number.NaN : Number(trimmed)
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > PIPELINE_LIMITS.itemValue
  ) {
    throw validationException(
      "value",
      "Value must be a number that is 0 or greater",
    )
  }
  return parsed
}

/**
 * How a due date read from a contact custom field treats a field that was
 * deleted (or no longer holds dates): adding an item still adds it without a
 * due date, while "Change due date" fails instead of clearing the date.
 */
type MissingDueDateField = "noDueDate" | "error"

async function resolveDueDate(
  dueDate: PipelineStepDueDate,
  env: ActionEnv,
  onMissingField: MissingDueDateField,
): Promise<Date | null> {
  if (dueDate.mode === "none") {
    return null
  }
  if (dueDate.mode === "fixed") {
    const at = new Date(dueDate.at)
    if (Number.isNaN(at.getTime())) {
      throw validationException("dueDate", "The fixed due date is not valid")
    }
    return at
  }
  const { workspaceId, contactId } = env.ctx
  if (!dueDate.customFieldId) {
    throw validationException("dueDate", "Choose a due date field")
  }
  assertIdShape(dueDate.customFieldId, "dueDate")
  const customField = await customFieldService.findBy({
    where: { workspaceId, id: dueDate.customFieldId },
  })
  if (!(customField && isTemporalCustomFieldType(customField.type))) {
    if (onMissingField === "noDueDate") {
      logger.warn(
        { workspaceId, customFieldId: dueDate.customFieldId },
        "Pipeline step due date field no longer exists; adding without a due date",
      )
      return null
    }
    throw validationException(
      "dueDate",
      "The due date field must be an existing date or datetime custom field",
    )
  }
  const stored = await contactCustomFieldValueService.findValue({
    contactId,
    customFieldId: customField.id,
  })
  if (stored === null || stored.trim() === "") {
    return null
  }
  const parsed = new Date(stored)
  if (Number.isNaN(parsed.getTime())) {
    throw validationException(
      "dueDate",
      "The contact's due date field does not hold a valid date",
    )
  }
  return parsed
}

async function interpolateFieldValues(
  values: PipelineStepOf<"addToPipeline">["fieldValues"],
  env: ActionEnv,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {}
  for (const { pipelineFieldId, value } of values) {
    if (pipelineFieldId) {
      resolved[pipelineFieldId] = await env.ctx.interpolate(value)
    }
  }
  return resolved
}

/** Interpolates `text`, trims it and cuts it to `max` characters. */
const interpolateText = async (env: ActionEnv, text: string, max: number) =>
  (await env.ctx.interpolate(text)).trim().slice(0, max)

/** Ids of the step that still exist; deleted ones are dropped. */
type LiveReferences = {
  memberIds: string[]
  teamIds: string[]
  fieldIds: ReadonlySet<string>
  stageId: string | undefined
}

/**
 * The admins, teams, pipeline fields and stage a step names that still exist.
 * A flow keeps running after one of them is deleted: the missing ones are
 * dropped (and logged) instead of sending every run to the error branch.
 * Only the lookups the step needs are made.
 */
async function liveReferences(
  env: ActionEnv,
  refs: {
    memberIds?: string[]
    teamIds?: string[]
    fieldIds?: string[]
    stageId?: string
  },
): Promise<LiveReferences> {
  const { workspaceId } = env.ctx
  const { pipelineId } = env
  const [members, teamIds, fields, stages] = await Promise.all([
    pipelineReferenceRepository.listWorkspaceMembers({
      workspaceId,
      ids: refs.memberIds ?? [],
    }),
    pipelineReferenceRepository.listInboxTeamIds({
      workspaceId,
      ids: refs.teamIds ?? [],
    }),
    refs.fieldIds?.length
      ? pipelineRepository.listFields({ workspaceId, pipelineId })
      : [],
    refs.stageId
      ? pipelineStageRepository.listByPipeline({ workspaceId, pipelineId })
      : [],
  ])
  const memberIdSet = new Set(members.map((member) => member.id))
  const teamIdSet = new Set(teamIds)
  const fieldIdSet = new Set(fields.map((field) => field.id))
  const live: LiveReferences = {
    memberIds: (refs.memberIds ?? []).filter((id) => memberIdSet.has(id)),
    teamIds: (refs.teamIds ?? []).filter((id) => teamIdSet.has(id)),
    fieldIds: new Set((refs.fieldIds ?? []).filter((id) => fieldIdSet.has(id))),
    stageId: stages.some((stage) => stage.id === refs.stageId)
      ? refs.stageId
      : undefined,
  }
  const dropped = {
    memberIds: (refs.memberIds ?? []).filter((id) => !memberIdSet.has(id)),
    teamIds: (refs.teamIds ?? []).filter((id) => !teamIdSet.has(id)),
    fieldIds: (refs.fieldIds ?? []).filter((id) => !fieldIdSet.has(id)),
    stageId: refs.stageId && !live.stageId ? refs.stageId : undefined,
  }
  if (
    dropped.memberIds.length +
      dropped.teamIds.length +
      dropped.fieldIds.length >
      0 ||
    dropped.stageId
  ) {
    logger.warn(
      { workspaceId, pipelineId, flowId: env.ctx.flowId, dropped },
      "Pipeline step names deleted references; they were skipped",
    )
  }
  return live
}

const assertIdShape = (id: string, field: string) => {
  if (!isBigintId(id)) {
    throw validationException(field, "The id is not valid")
  }
}

const assertIdsShape = (ids: string[], field: string) => {
  for (const id of ids) {
    assertIdShape(id, field)
  }
}

const requireId = (id: string | undefined, field: string, label: string) => {
  if (!id) {
    throw validationException(field, `Choose a ${label}`)
  }
  assertIdShape(id, field)
  return id
}

export const PIPELINE_FLOW_ACTION_HANDLERS: {
  [A in PipelineStepAction]: ActionHandler<A>
} = {
  async addToPipeline(step, env) {
    const stageId = step.stageId || undefined
    assertIdsShape(step.assigneeMemberIds, "assigneeMemberIds")
    assertIdsShape(step.assigneeInboxTeamIds, "assigneeInboxTeamIds")
    assertIdsShape(
      step.fieldValues.map((entry) => entry.pipelineFieldId).filter(Boolean),
      "fieldValues",
    )
    if (stageId) {
      assertIdShape(stageId, "stageId")
    }
    // A deleted stage falls back to the first one; deleted admins, teams and
    // fields are left out, so the item is still created.
    const live = await liveReferences(env, {
      memberIds: step.assigneeMemberIds,
      teamIds: step.assigneeInboxTeamIds,
      fieldIds: step.fieldValues
        .map((entry) => entry.pipelineFieldId)
        .filter(Boolean),
      stageId,
    })
    const title = await interpolateText(env, step.title, PIPELINE_LIMITS.title)
    const description = await interpolateText(
      env,
      step.description,
      PIPELINE_LIMITS.description,
    )
    await pipelineItemService.create({
      workspaceId: env.ctx.workspaceId,
      pipelineId: env.pipelineId,
      contactId: env.ctx.contactId,
      fields: {
        title: title || FALLBACK_TITLE,
        description: description || null,
        status: step.status,
        stageId: live.stageId,
        dueDate: await resolveDueDate(step.dueDate, env, "noDueDate"),
        assigneeMemberIds: live.memberIds,
        assigneeInboxTeamIds: live.teamIds,
        fieldValues: await interpolateFieldValues(
          step.fieldValues.filter(({ pipelineFieldId }) =>
            live.fieldIds.has(pipelineFieldId),
          ),
          env,
        ),
      },
      idempotencyKey: env.idempotencyKey,
      scope: FLOW_SCOPE,
      actor: env.actor,
    })
    return success
  },

  moveToStage: onTarget(async (step, env, target) => {
    const stageId = requireId(step.stageId, "stageId", "stage")
    await updateTarget(env, target, { stageId })
  }),

  changeValue: onTarget(async (step, env, target) => {
    const value = parseValue(await env.ctx.interpolate(step.value))
    await updateTarget(env, target, { value })
  }),

  assign: onTarget(async (step, env, target) => {
    // An empty assignee list would otherwise clear the item's assignees and
    // report success.
    if (
      step.assigneeMemberIds.length === 0 &&
      step.assigneeInboxTeamIds.length === 0
    ) {
      throw validationException(
        "assigneeMemberIds",
        "The assign step has no assignees",
      )
    }
    assertIdsShape(step.assigneeMemberIds, "assigneeMemberIds")
    assertIdsShape(step.assigneeInboxTeamIds, "assigneeInboxTeamIds")
    const live = await liveReferences(env, {
      memberIds: step.assigneeMemberIds,
      teamIds: step.assigneeInboxTeamIds,
    })
    if (live.memberIds.length === 0 && live.teamIds.length === 0) {
      throw validationException(
        "assigneeMemberIds",
        "None of the step's assignees exist any more",
      )
    }
    await updateTarget(env, target, {
      assigneeMemberIds: live.memberIds,
      assigneeInboxTeamIds: live.teamIds,
    })
  }),

  changeStatus: onTarget(async (step, env, target) => {
    await updateTarget(env, target, { status: step.status })
  }),

  changePriority: onTarget(async (step, env, target) => {
    await updateTarget(env, target, { priority: step.priority })
  }),

  changeDueDate: onTarget(async (step, env, target) => {
    await updateTarget(env, target, {
      dueDate: await resolveDueDate(step.dueDate, env, "error"),
    })
  }),

  changeTitle: onTarget(async (step, env, target) => {
    const title = await interpolateText(env, step.title, PIPELINE_LIMITS.title)
    if (!title) {
      throw validationException("title", "The title is empty")
    }
    await updateTarget(env, target, { title })
  }),

  setCustomField: onTarget(async (step, env, target) => {
    if (!step.pipelineFieldId) {
      throw validationException("pipelineFieldId", "Choose a field")
    }
    assertIdShape(step.pipelineFieldId, "pipelineFieldId")
    const value = await env.ctx.interpolate(step.value)
    await updateTarget(env, target, {
      fieldValues: { [step.pipelineFieldId]: value },
    })
  }),

  clearCustomField: onTarget(async (step, env, target) => {
    const ids = step.pipelineFieldIds.filter(Boolean)
    if (ids.length === 0) {
      throw validationException("pipelineFieldIds", "Choose at least one field")
    }
    assertIdsShape(ids, "pipelineFieldIds")
    // A deleted field has no value left to clear.
    const { fieldIds } = await liveReferences(env, { fieldIds: ids })
    if (fieldIds.size === 0) {
      return
    }
    await updateTarget(env, target, {
      fieldValues: Object.fromEntries([...fieldIds].map((id) => [id, null])),
    })
  }),

  changeDescription: onTarget(async (step, env, target) => {
    const description = await interpolateText(
      env,
      step.description,
      PIPELINE_LIMITS.description,
    )
    await updateTarget(env, target, { description: description || null })
  }),

  removeFromPipeline: onTarget(async (_step, env, target) => {
    await pipelineItemService.delete({
      workspaceId: env.ctx.workspaceId,
      pipelineId: env.pipelineId,
      itemId: target.id,
      scope: FLOW_SCOPE,
      actor: env.actor,
    })
  }),

  addComment: onTarget(async (step, env, target) => {
    const text = (await env.ctx.interpolate(step.text)).trim()
    if (!text) {
      throw validationException("text", "The comment is empty")
    }
    if (text.length > PIPELINE_LIMITS.comment) {
      throw validationException(
        "text",
        `The comment is longer than ${PIPELINE_LIMITS.comment} characters`,
      )
    }
    await pipelineItemContentService.addComment({
      workspaceId: env.ctx.workspaceId,
      pipelineId: env.pipelineId,
      itemId: target.id,
      text,
      idempotencyKey: env.idempotencyKey,
      scope: FLOW_SCOPE,
      actor: env.actor,
    })
  }),

  transfer: onTarget(async (step, env, target) => {
    const destinationPipelineId = requireId(
      step.destinationPipelineId,
      "destinationPipelineId",
      "destination pipeline",
    )
    const destinationStageId = step.destinationStageId || undefined
    if (destinationStageId) {
      assertIdShape(destinationStageId, "destinationStageId")
    }
    await pipelineItemService.transfer({
      workspaceId: env.ctx.workspaceId,
      pipelineId: env.pipelineId,
      itemId: target.id,
      destinationPipelineId,
      destinationStageId,
      scope: FLOW_SCOPE,
      actor: env.actor,
    })
  }),
}

/** Dedup is only safe for actions that add something; a retried "set" is already idempotent. */
const DEDUPED_ACTIONS: ReadonlySet<PipelineStepAction> = new Set([
  "addToPipeline",
  "addComment",
])

/**
 * Runs one Pipelines flow step. Never throws for caller-fixable problems:
 * a missing target is `skip`, a validation/conflict/not-found failure is
 * `error`. Unexpected failures (database down) propagate so the job retries.
 */
export async function runPipelineFlowAction(
  step: PipelineStepSchema,
  ctx: PipelineFlowActionContext,
): Promise<PipelineFlowActionResult> {
  if (!step.pipelineId) {
    return fail("No pipeline is selected")
  }
  if (!isBigintId(step.pipelineId)) {
    return fail("The pipeline id is not valid")
  }
  const env: ActionEnv = {
    ctx,
    actor: { kind: "flow", userId: null, sourceId: ctx.flowId },
    pipelineId: step.pipelineId,
    idempotencyKey:
      ctx.flowExecutionKey && DEDUPED_ACTIONS.has(step.action)
        ? `${ctx.flowExecutionKey}:${step.id}`
        : undefined,
  }
  try {
    const handler = PIPELINE_FLOW_ACTION_HANDLERS[
      step.action
    ] as ActionHandler<PipelineStepAction>
    return await handler(step, env)
  } catch (error) {
    if (error instanceof ChatbotXException) {
      return fail(error.message)
    }
    throw error
  }
}
