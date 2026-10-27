import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  isWithinPipelineDateRange,
  type PipelineItemStatus,
  roundToMoneyScale,
} from "@chatbotx.io/database/partials"
import {
  acquirePipelineAdvisoryLock,
  pipelineActivityRepository,
  pipelineItemContentRepository,
  pipelineItemRepository,
  pipelineReferenceRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import type {
  PipelineItemModel,
  PipelineModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import type { PipelineAccessScope } from "./access"
import {
  applyAssignees,
  assertAssigneesExist,
  assigneesFromInput,
  currentAssignees,
  hasAssigneePatch,
  queueAssignmentEffect,
} from "./item-assignees"
import type { MutationContext } from "./item-base.service"
import { PipelineItemBaseService } from "./item-base.service"
import {
  assertRequiredFields,
  lockFieldsOrFail,
  mergeFieldValues,
  remapFieldValues,
} from "./item-fields"
import type {
  CreatePipelineItemInput,
  PipelineItemWriteFields,
} from "./item-write-types"
import {
  activityRowFor,
  activityRowsFromDiff,
  createdEffects,
  diffPipelineItem,
  effectsFromDiff,
  isEmptyDiff,
  pipelineEventMetadata,
  realtimeEffect,
} from "./mutation-engine"
import { pipelineService } from "./service"
import type { PipelineActor } from "./types"

export type {
  CreatePipelineItemInput,
  PipelineItemWriteFields,
} from "./item-write-types"

type UpdatePipelineItemInput = {
  workspaceId: string
  pipelineId: string
  itemId: string
  fields: PipelineItemWriteFields
  scope: PipelineAccessScope
  actor: PipelineActor
}

const isOpen = (status: PipelineItemStatus) => status === "open"

/** The patched value, or the stored one when the patch leaves it out. */
const keep = <T>(patch: T | undefined, current: T): T =>
  patch === undefined ? current : patch

/**
 * A value as the money column will store it, so a repeated write of the same
 * over-precise amount diffs as "unchanged" instead of re-emitting a change.
 */
const storedValue = <T extends number | null | undefined>(value: T): T =>
  (typeof value === "number" ? roundToMoneyScale(value) : value) as T

/**
 * A due date the database can store. Every writer (API, action, flow step)
 * passes here, so an out-of-range date is a 422, never a database error.
 */
const storedDueDate = <T extends Date | null | undefined>(dueDate: T): T => {
  if (dueDate instanceof Date && !isWithinPipelineDateRange(dueDate)) {
    throw validationException(
      "dueDate",
      "Due date must be between 1900 and 2200",
    )
  }
  return dueDate
}

const stageNamesOf = (stages: PipelineStageModel[]) =>
  new Map(stages.map((stage) => [stage.id, stage.name]))

export class PipelineItemService extends PipelineItemBaseService {
  // Create --------------------------------------------------------------------

  async create(input: CreatePipelineItemInput): Promise<PipelineItemModel> {
    const pipeline = await pipelineService.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: "edit",
    })
    return await this.mutate((context) =>
      this.createInTransaction(input, pipeline, context),
    )
  }

  private async createInTransaction(
    input: CreatePipelineItemInput,
    pipeline: PipelineModel,
    { tx, effects }: MutationContext,
  ): Promise<PipelineItemModel> {
    const { workspaceId, pipelineId, contactId, actor } = input
    const status = input.fields.status ?? "open"
    if (isOpen(status)) {
      await acquirePipelineAdvisoryLock(
        tx,
        this.openLockKey(workspaceId, pipelineId, contactId),
      )
    }
    // A replay returns the first result before any limit or required-field
    // check, which the first attempt's own item would now trip.
    const replay = await this.findReplay(input, tx)
    if (replay) {
      return replay
    }
    const stages = await pipelineStageRepository.listByPipeline(
      { workspaceId, pipelineId },
      tx,
    )
    const stage = await this.lockStage(
      this.resolveStage(stages, input.fields.stageId),
      tx,
    )
    await this.assertReferences({ ...input, tx })
    const definitions = await pipelineRepository.listFields(
      { workspaceId, pipelineId },
      tx,
    )
    const fieldValues = await mergeFieldValues({
      definitions,
      current: {},
      patch: input.fields.fieldValues ?? {},
      explicitTimezone: input.fields.fieldValuesTimezone,
      workspaceId,
      pipelineId,
      contactId,
      tx,
    })
    assertRequiredFields(definitions, fieldValues)
    if (isOpen(status)) {
      await this.assertOpenLimit({ pipeline, contactId, tx })
    }

    const now = new Date()
    const { row, inserted } = await pipelineItemRepository.insertIdempotent(
      {
        workspaceId,
        pipelineId,
        stageId: stage.id,
        contactId,
        number: await pipelineRepository.nextItemNumber(workspaceId, tx),
        title: input.fields.title,
        description: input.fields.description ?? null,
        value: storedValue(input.fields.value) ?? null,
        status,
        priority: input.fields.priority ?? "medium",
        dueDate: storedDueDate(input.fields.dueDate) ?? null,
        fieldValues,
        createdById: actor.userId,
        stageEnteredAt: now,
        statusChangedAt: null,
        closedAt: isOpen(status) ? null : now,
        closedById: isOpen(status) ? null : actor.userId,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      tx,
    )
    if (!inserted) {
      if (row.contactId !== contactId) {
        throw this.idempotencyKeyConflict()
      }
      return row
    }

    const assignees = assigneesFromInput(input.fields)
    await pipelineItemRepository.replaceAssignees(
      { workspaceId, itemId: row.id, ...assignees },
      tx,
    )
    await pipelineItemContentRepository.insertAttachments(
      {
        workspaceId,
        itemId: row.id,
        mediaLibraryFileIds: input.mediaLibraryFileIds ?? [],
      },
      tx,
    )
    await pipelineActivityRepository.insertMany(
      [
        activityRowFor(
          "created",
          { item: row, actor, now },
          { toValue: row.value, toStageId: row.stageId, toStatus: row.status },
        ),
      ],
      tx,
    )
    effects.push(
      ...createdEffects({
        pipeline,
        stage,
        item: row,
        actor,
        stageNames: stageNamesOf(stages),
      }),
    )
    // An item created without assignees has no primary to assign the contact to.
    if (
      assignees.workspaceMemberIds.length + assignees.inboxTeamIds.length >
      0
    ) {
      await queueAssignmentEffect({
        pipeline,
        item: row,
        before: null,
        tx,
        effects,
      })
    }
    return row
  }

  // Update / move -------------------------------------------------------------

  async update(input: UpdatePipelineItemInput): Promise<PipelineItemModel> {
    const pipeline = await pipelineService.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: "edit",
    })
    return await this.mutate((context) =>
      this.updateInTransaction(input, pipeline, context),
    )
  }

  private async updateInTransaction(
    input: UpdatePipelineItemInput,
    pipeline: PipelineModel,
    { tx, effects }: MutationContext,
  ): Promise<PipelineItemModel> {
    const { workspaceId, pipelineId, itemId, fields, actor } = input
    const before = await this.lockForUpdate(input, tx)
    const reopens = fields.status === "open" && !isOpen(before.status)
    const stages = await pipelineStageRepository.listByPipeline(
      { workspaceId, pipelineId },
      tx,
    )
    const stage = await this.resolveUpdateStage(
      stages,
      before,
      fields.stageId,
      tx,
    )
    const assigneePatched = hasAssigneePatch(fields)
    // Read only for an assignee patch: nothing else uses the previous set.
    const assigneesBefore = assigneePatched
      ? await currentAssignees(workspaceId, itemId, tx)
      : null
    if (assigneePatched) {
      await this.assertContactExists(workspaceId, before.contactId, tx)
      await assertAssigneesExist(workspaceId, fields, tx)
    }
    const fieldValues = fields.fieldValues
      ? await this.patchFieldValues(input, before, fields.fieldValues, tx)
      : before.fieldValues

    const status = fields.status ?? before.status
    if (reopens) {
      await this.assertOpenLimit({
        pipeline,
        contactId: before.contactId,
        tx,
        exceptItemId: before.id,
      })
    }
    const now = new Date()
    const next = {
      title: fields.title ?? before.title,
      description: keep(fields.description, before.description),
      value: keep(storedValue(fields.value), before.value),
      priority: fields.priority ?? before.priority,
      dueDate: keep(storedDueDate(fields.dueDate), before.dueDate),
      status,
      stageId: stage.id,
      fieldValues,
    }
    const diff = diffPipelineItem(before, next)
    // A patch that changes nothing writes nothing: no updatedAt bump, activity or effects.
    let row: PipelineItemModel | undefined = isEmptyDiff(diff)
      ? before
      : await pipelineItemRepository.update(
          {
            workspaceId,
            id: itemId,
            values: {
              ...next,
              ...(diff.stage ? { stageEnteredAt: now } : {}),
              ...(diff.status
                ? this.statusBookkeeping(status, now, actor)
                : {}),
            },
          },
          tx,
        )
    if (!row) {
      throw notFoundException("Item not found")
    }

    const activity = activityRowsFromDiff(diff, { item: row, actor, now })
    const assigneesChanged =
      assigneePatched && assigneesBefore
        ? (
            await applyAssignees({
              fields,
              workspaceId,
              itemId,
              before: assigneesBefore,
              tx,
            })
          ).changed
        : false
    if (assigneesChanged) {
      if (isEmptyDiff(diff)) {
        row =
          (await pipelineItemRepository.touch(
            { workspaceId, id: itemId },
            tx,
          )) ?? row
      }
      activity.push(
        activityRowFor("assigneesChanged", { item: row, actor, now }),
      )
    }
    await pipelineActivityRepository.insertMany(activity, tx)
    effects.push(
      ...effectsFromDiff(diff, {
        pipeline,
        stage,
        item: row,
        actor,
        stageNames: stageNamesOf(stages),
      }),
    )
    if (assigneesChanged && !diff.stage) {
      effects.push(realtimeEffect(row, "updated"))
    }
    // An unchanged assignee set cannot change the primary assignee, so a
    // title-only update skips the effect and its lookups. After a change the
    // set is re-read: the primary follows the kept rows' createdAt order, not
    // the order of the patch.
    if (assigneesChanged) {
      await queueAssignmentEffect({
        pipeline,
        item: row,
        before: assigneesBefore,
        tx,
        effects,
      })
    }
    return row
  }

  /**
   * Row-locks the item for an update. The open-limit advisory lock is taken
   * whenever the caller asks for `open`: whether that is a reopen is only known
   * after the row lock, and advisory locks must come before row locks to keep
   * the order transfer uses.
   */
  private async lockForUpdate(
    input: UpdatePipelineItemInput,
    tx: DatabaseClient,
  ): Promise<PipelineItemModel> {
    const { workspaceId, pipelineId, itemId } = input
    if (input.fields.status === "open") {
      const peek = await this.findItemOrFail({
        workspaceId,
        pipelineId,
        itemId,
        tx,
      })
      await acquirePipelineAdvisoryLock(
        tx,
        this.openLockKey(workspaceId, pipelineId, peek.contactId),
      )
    }
    // The item may have been transferred between the peek and the lock.
    return await this.lockItemOrFail({ workspaceId, pipelineId, itemId, tx })
  }

  /**
   * The stage the item ends up in. Locking the stage only when the item
   * changes stage keeps the lock order (stage before item) away from an inline
   * stage delete, which locks the stage first and then its items. Naming the
   * stage the item is already in moves nothing, so a busy stage is not an
   * error there.
   */
  private async resolveUpdateStage(
    stages: PipelineStageModel[],
    before: PipelineItemModel,
    requestedStageId: string | undefined,
    tx: DatabaseClient,
  ): Promise<PipelineStageModel> {
    const current = this.stageById(stages, before.stageId)
    if (!requestedStageId || requestedStageId === before.stageId) {
      return current
    }
    const target = this.resolveStage(stages, requestedStageId)
    this.assertStageNotBulkOwned(current)
    return await this.lockStage(target, tx)
  }

  /**
   * Only the fields a patch touches are checked: a required field added later
   * must not freeze every older item (moves, status, assignees), nor block
   * filling its sibling required fields one at a time. Clearing a required
   * field is still rejected.
   */
  private async patchFieldValues(
    input: UpdatePipelineItemInput,
    before: PipelineItemModel,
    patch: Record<string, string | null>,
    tx: DatabaseClient,
  ): Promise<Record<string, string>> {
    const { workspaceId, pipelineId } = input
    const definitions = await pipelineRepository.listFields(
      { workspaceId, pipelineId },
      tx,
    )
    const merged = await mergeFieldValues({
      definitions,
      current: before.fieldValues,
      patch,
      explicitTimezone: input.fields.fieldValuesTimezone,
      workspaceId,
      pipelineId,
      contactId: before.contactId,
      tx,
    })
    assertRequiredFields(definitions, merged, Object.keys(patch))
    return merged
  }

  async move(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    stageId: string
    scope: PipelineAccessScope
    actor: PipelineActor
  }): Promise<PipelineItemModel> {
    return await this.update({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      itemId: input.itemId,
      fields: { stageId: input.stageId },
      scope: input.scope,
      actor: input.actor,
    })
  }

  // Transfer ------------------------------------------------------------------

  /** Moves an item to another pipeline, keeping its number and creation time. */
  async transfer(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    destinationPipelineId: string
    destinationStageId?: string
    scope: PipelineAccessScope
    actor: PipelineActor
  }): Promise<PipelineItemModel> {
    if (input.destinationPipelineId === input.pipelineId) {
      throw validationException(
        "destinationPipelineId",
        "Choose a different pipeline",
      )
    }
    await pipelineService.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: "edit",
    })
    const destination = await pipelineService.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.destinationPipelineId,
      scope: input.scope,
      action: "edit",
    })
    const transferred = await this.mutate((context) =>
      this.transferInTransaction(input, destination, context),
    )
    await this.audit(
      "update",
      `transferred pipeline ${input.pipelineId} item ${input.itemId} to pipeline ${input.destinationPipelineId}`,
    )
    return transferred
  }

  private async transferInTransaction(
    input: {
      workspaceId: string
      pipelineId: string
      itemId: string
      destinationStageId?: string
      actor: PipelineActor
    },
    destination: PipelineModel,
    { tx, effects }: MutationContext,
  ): Promise<PipelineItemModel> {
    const { workspaceId, pipelineId, itemId, actor } = input
    const peek = await this.findItemOrFail({
      workspaceId,
      pipelineId,
      itemId,
      tx,
    })
    // Both pipelines' open-limit keys, in a fixed order, so two opposite
    // transfers of the same contact cannot deadlock.
    const keys = [pipelineId, destination.id]
      .map((id) => this.openLockKey(workspaceId, id, peek.contactId))
      .sort()
    for (const key of keys) {
      await acquirePipelineAdvisoryLock(tx, key)
    }
    const before = await this.lockItemOrFail({
      workspaceId,
      pipelineId,
      itemId,
      tx,
    })
    const [sourceStages, destinationStages, sourceFields, destinationFields] =
      await Promise.all([
        pipelineStageRepository.listByPipeline({ workspaceId, pipelineId }, tx),
        pipelineStageRepository.listByPipeline(
          { workspaceId, pipelineId: destination.id },
          tx,
        ),
        pipelineRepository.listFields({ workspaceId, pipelineId }, tx),
        pipelineRepository.listFields(
          { workspaceId, pipelineId: destination.id },
          tx,
        ),
      ])
    this.assertStageNotBulkOwned(this.stageById(sourceStages, before.stageId))
    const stage = await this.lockStage(
      this.resolveStage(destinationStages, input.destinationStageId),
      tx,
    )
    const fieldValues = remapFieldValues(
      sourceFields,
      destinationFields,
      before.fieldValues,
    )
    await lockFieldsOrFail({
      workspaceId,
      pipelineId: destination.id,
      fieldIds: Object.keys(fieldValues),
      tx,
    })
    // A required destination field the source has no value for stays empty,
    // like existing items when a required field is added: "required" is
    // enforced when a person creates or edits the item, not on a move.
    if (isOpen(before.status)) {
      await this.assertOpenLimit({
        pipeline: destination,
        contactId: before.contactId,
        tx,
      })
    }

    const now = new Date()
    const row = await pipelineItemRepository.update(
      {
        workspaceId,
        id: itemId,
        values: {
          pipelineId: destination.id,
          stageId: stage.id,
          stageEnteredAt: now,
          fieldValues,
          // Keys are unique per pipeline; the item leaves the source's scope.
          idempotencyKey: null,
        },
      },
      tx,
    )
    if (!row) {
      throw notFoundException("Item not found")
    }
    await pipelineActivityRepository.insertMany(
      [
        activityRowFor(
          "transferred",
          { item: row, actor, now, fromPipelineId: pipelineId },
          { fromStageId: before.stageId, toStageId: stage.id },
        ),
      ],
      tx,
    )
    const sourceStageNames = stageNamesOf(sourceStages)
    effects.push(
      {
        kind: "event",
        eventType: "pipelineItemMovedToStage",
        workspaceId,
        contactId: row.contactId,
        metadata: pipelineEventMetadata(
          {
            pipeline: destination,
            stage,
            item: row,
            actor,
            stageNames: sourceStageNames,
          },
          {
            fromStageId: before.stageId,
            fromStageName: sourceStageNames.get(before.stageId),
            fromPipelineId: pipelineId,
          },
        ),
      },
      realtimeEffect(
        { workspaceId, pipelineId, id: itemId, contactId: row.contactId },
        "deleted",
      ),
      realtimeEffect(row, "created"),
    )
    return row
  }

  // Delete --------------------------------------------------------------------

  async delete(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    scope: PipelineAccessScope
    actor: PipelineActor
  }): Promise<void> {
    const { workspaceId, itemId, actor } = input
    await this.withLockedItem(
      input,
      "delete",
      async ({ tx, effects, item }) => {
        await pipelineItemRepository.delete({ workspaceId, id: itemId }, tx)
        await pipelineActivityRepository.insertMany(
          [
            activityRowFor(
              "deleted",
              { item, actor, now: new Date() },
              { fromStageId: item.stageId },
            ),
          ],
          tx,
        )
        effects.push(realtimeEffect(item, "deleted"))
      },
    )
    await this.audit(
      "delete",
      `deleted pipeline ${input.pipelineId} item ${itemId}`,
    )
  }

  // System-context target resolution (flow actions, variables) ----------------

  /** The contact's most recently created open item in the pipeline, if any. */
  async resolveTargetForContact(input: {
    workspaceId: string
    pipelineId: string
    contactId: string
  }): Promise<PipelineItemModel | null> {
    return (
      (await pipelineItemRepository.findLatestOpenForContact(input)) ?? null
    )
  }

  // Internals -----------------------------------------------------------------

  private idempotencyKeyConflict() {
    return conflictException(
      "This idempotency key was already used for another contact",
      "pipelineItemIdempotencyKeyConflict",
    )
  }

  /** A replayed create returns its first result; a key reused for another contact conflicts. */
  private async findReplay(
    input: CreatePipelineItemInput,
    tx: DatabaseClient,
  ): Promise<PipelineItemModel | null> {
    if (!input.idempotencyKey) {
      return null
    }
    const existing = await pipelineItemRepository.findByIdempotencyKey(
      {
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
        idempotencyKey: input.idempotencyKey,
      },
      tx,
    )
    if (!existing) {
      return null
    }
    if (existing.contactId !== input.contactId) {
      throw this.idempotencyKeyConflict()
    }
    return existing
  }

  private async assertContactExists(
    workspaceId: string,
    contactId: string,
    tx: DatabaseClient,
  ) {
    if (
      !(await pipelineReferenceRepository.contactExists(
        { workspaceId, id: contactId },
        tx,
      ))
    ) {
      throw notFoundException("Contact not found")
    }
  }

  /** Every referenced id must exist in this workspace, or the request is a 404. */
  private async assertReferences(
    input: CreatePipelineItemInput & { tx: DatabaseClient },
  ) {
    const { workspaceId, tx } = input
    await this.assertContactExists(workspaceId, input.contactId, tx)
    await assertAssigneesExist(workspaceId, input.fields, tx)
    await this.assertMediaFiles(
      workspaceId,
      input.mediaLibraryFileIds ?? [],
      tx,
    )
  }

  private async assertOpenLimit(input: {
    pipeline: {
      id: string
      workspaceId: string
      settings: { maxOpenItemsPerContact: number | null }
    }
    contactId: string
    tx: DatabaseClient
    exceptItemId?: string
  }) {
    const max = input.pipeline.settings.maxOpenItemsPerContact
    if (max === null) {
      return
    }
    const others = await pipelineItemRepository.countOpenForContact(
      {
        workspaceId: input.pipeline.workspaceId,
        pipelineId: input.pipeline.id,
        contactId: input.contactId,
        exceptItemId: input.exceptItemId,
      },
      input.tx,
    )
    if (others >= max) {
      throw conflictException(
        `This contact already has ${max} open item(s) in this pipeline`,
        "pipelineItemLimitReached",
      )
    }
  }

  private statusBookkeeping(
    status: PipelineItemStatus,
    now: Date,
    actor: PipelineActor,
  ) {
    return isOpen(status)
      ? { statusChangedAt: now, closedAt: null, closedById: null }
      : { statusChangedAt: now, closedAt: now, closedById: actor.userId }
  }
}

export const pipelineItemService = new PipelineItemService()
