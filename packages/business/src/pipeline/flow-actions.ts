import { PIPELINE_LIMITS } from "@chatbotx.io/database/partials"
import { pipelineRepository } from "@chatbotx.io/database/repositories"
import { isBigintId } from "@chatbotx.io/database/utils"
import type {
  PipelineStepAction,
  PipelineStepDueDate,
  PipelineStepOf,
  PipelineStepSchema,
} from "@chatbotx.io/flow-config"
import { contactCustomFieldValueService } from "../contact-custom-field/value-service"
import { customFieldService } from "../custom-field/service"
import { ChatbotXException, validationException } from "../errors"
import type { PipelineAccessScope } from "./access"
import { pipelineItemService } from "./item.service"
import { pipelineItemContentService } from "./item-content.service"
import type { PipelineActor } from "./types"

/** Flow steps are system context: the workspace owns the pipeline, not a member. */
const FLOW_SCOPE: PipelineAccessScope = { kind: "workspaceToken" }
const FALLBACK_TITLE = "Untitled"
const PIPELINE_MISSING_MESSAGE = "The pipeline does not exist in this workspace"
const DUE_DATE_FIELD_TYPES = new Set(["date", "datetime"])

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

async function resolveDueDate(
  dueDate: PipelineStepDueDate,
  env: ActionEnv,
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
  if (!(customField && DUE_DATE_FIELD_TYPES.has(customField.type))) {
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
        stageId,
        dueDate: await resolveDueDate(step.dueDate, env),
        assigneeMemberIds: step.assigneeMemberIds,
        assigneeInboxTeamIds: step.assigneeInboxTeamIds,
        fieldValues: await interpolateFieldValues(step.fieldValues, env),
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
    await updateTarget(env, target, {
      assigneeMemberIds: step.assigneeMemberIds,
      assigneeInboxTeamIds: step.assigneeInboxTeamIds,
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
      dueDate: await resolveDueDate(step.dueDate, env),
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
    await updateTarget(env, target, {
      fieldValues: Object.fromEntries(ids.map((id) => [id, null])),
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
