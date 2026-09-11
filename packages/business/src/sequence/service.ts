import {
  and,
  db,
  eq,
  findOrFail,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  type SequenceListInput,
  sequenceRepository,
} from "@chatbotx.io/database/repositories"
import { sequenceModel, sequenceStepModel } from "@chatbotx.io/database/schema"
import type {
  SequenceModel,
  SequenceStepModel,
} from "@chatbotx.io/database/types"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import {
  handleStepCreationImpact,
  handleStepUpdateImpact,
  recalculateAllContactsInSequence,
} from "./contact-schedule"
import {
  buildCreateData,
  buildUpdateData,
  type SequenceStepPayloadInput,
} from "./step-payload"

/**
 * Check if we need to recalculate contact schedules when UPDATING a step.
 *
 * RECALCULATE when these fields change:
 * delayDays/delayMinutes/delayUnit: Changes step timing
 * isActive: Step becomes available/unavailable → contacts skip or process
 * order: Step position changes → affects timeline
 *
 * NO RECALCULATE when these fields change:
 * flowId: Only changes message content, does not affect schedule
 * sendTimeStart/sendTimeEnd: Only affects worker dispatch time
 * sendDays: Only affects worker dispatch days
 * anytime: Only affects worker dispatch logic
 * specificDateTime: Handled within recalculation logic
 */
function shouldRecalculateOnUpdate(
  parsedInput: SequenceStepPayloadInput,
  previousOrder: number,
): boolean {
  const { delayDays, delayMinutes, delayUnit, isActive, order } = parsedInput

  return (
    delayDays !== undefined ||
    delayMinutes !== undefined ||
    delayUnit !== undefined ||
    isActive !== undefined ||
    order !== previousOrder
  )
}

class SequenceService extends BaseService {
  /**
   * SQL-paginated sequence list with step counts — shared by the public API
   * (`GET /v1/sequences`) and the builder's sequences page.
   */
  async list(input: SequenceListInput) {
    const pagination = getPaginationWithDefaults(input)

    const [data, total] = await Promise.all([
      sequenceRepository.listWithCounts(input),
      sequenceRepository.count(input),
    ])

    return { data, pageCount: Math.ceil(total / pagination.limit) }
  }

  async create(input: {
    workspaceId: string
    name: string
    folderId?: string | null
  }): Promise<{ sequenceId: string }> {
    const sequenceId = createId()

    try {
      await db.insert(sequenceModel).values({
        id: sequenceId,
        workspaceId: input.workspaceId,
        name: input.name,
        folderId: input.folderId || null,
      })
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken.")
      }
      throw error
    }

    await this.audit("create", `created a new sequence (#${sequenceId})`)

    return { sequenceId }
  }

  /**
   * Partial update of a sequence's name/active/folderId. No-ops when
   * nothing changed. A duplicate `name` raises `validationException("name",
   * ...)` — the action maps that to a form-level `returnValidationErrors`
   * response, mirroring `create`'s handling of the same unique constraint.
   */
  async update(
    ctx: { workspaceId: string; id: string },
    data: { name?: string; active?: boolean; folderId?: string | null },
  ): Promise<void> {
    const sequence = await findOrFail({
      table: sequenceModel,
      where: {
        id: ctx.id,
        workspaceId: ctx.workspaceId,
      },
      message: "Sequence not found",
    })

    const changedEntries = Object.entries(data).filter(
      ([key, value]) => sequence[key as keyof typeof data] !== value,
    )

    if (changedEntries.length === 0) {
      return
    }

    try {
      const updated = await db
        .update(sequenceModel)
        .set(data)
        .where(
          and(
            eq(sequenceModel.id, ctx.id),
            eq(sequenceModel.workspaceId, ctx.workspaceId),
          ),
        )
        .returning({ id: sequenceModel.id })

      if (updated.length === 0) {
        return
      }
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken.")
      }
      throw error
    }

    const changedKeys = changedEntries.map(([key]) => key)
    let detail = `updated a sequence (#${sequence.id})`
    if (changedKeys.length === 1 && changedKeys[0] === "active") {
      detail = data.active
        ? `enabled a sequence (#${sequence.id})`
        : `disabled a sequence (#${sequence.id})`
    }

    await this.audit("update", detail)
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const sequence = await findOrFail({
      table: sequenceModel,
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
      message: "Sequence not found",
    })

    await db
      .delete(sequenceModel)
      .where(
        and(
          eq(sequenceModel.id, input.id),
          eq(sequenceModel.workspaceId, input.workspaceId),
        ),
      )

    await this.audit("delete", `deleted a sequence (#${sequence.id})`)
  }

  async assertOwned(input: {
    workspaceId: string
    sequenceId: string
  }): Promise<SequenceModel> {
    return await findOrFail({
      table: sequenceModel,
      where: {
        id: input.sequenceId,
        workspaceId: input.workspaceId,
      },
      message: "Sequence not found",
    })
  }

  async findWithSteps(input: { workspaceId: string; id: string }) {
    const sequence = await sequenceRepository.findWithSteps({
      id: input.id,
      workspaceId: input.workspaceId,
    })

    if (!sequence) {
      throw notFoundException("Sequence not found")
    }

    return {
      ...sequence,
      steps: sequence.sequenceSteps,
    }
  }

  async createStep(input: {
    workspaceId: string
    sequenceId: string
    data: SequenceStepPayloadInput
  }): Promise<SequenceStepModel> {
    const createData = buildCreateData(input.data, input.sequenceId, createId())
    const [created] = await db
      .insert(sequenceStepModel)
      .values(createData)
      .returning()

    return created
  }

  async updateStep(input: {
    workspaceId: string
    stepId: string
    /** See `deleteStep`'s `sequenceId` — same parent-assertion contract. */
    sequenceId?: string
    data: SequenceStepPayloadInput
  }): Promise<{ previousOrder: number; step: SequenceStepModel }> {
    const step = await db.query.sequenceStepModel.findFirst({
      where: {
        id: input.stepId,
      },
      with: {
        sequence: true,
      },
    })

    if (!step) {
      throw notFoundException("Step not found")
    }

    if (step.sequence.workspaceId !== input.workspaceId) {
      throw notFoundException("Step not found")
    }

    if (input.sequenceId && step.sequenceId !== input.sequenceId) {
      throw notFoundException("Step not found")
    }

    const updateData = buildUpdateData(input.data)

    const [updated] = await db
      .update(sequenceStepModel)
      .set(updateData)
      .where(eq(sequenceStepModel.id, input.stepId))
      .returning()

    return { previousOrder: step.order, step: updated }
  }

  async deleteStep(input: {
    workspaceId: string
    stepId: string
    /**
     * Optional parent-sequence assertion. A caller whose URL names the
     * parent (`DELETE /v1/sequences/{id}/steps/{stepId}`) must pass it, or
     * the `{id}` segment is decorative: the step resolves by `stepId` alone,
     * so a step belonging to a *different* sequence in the same workspace
     * would be deleted while the URL claims otherwise. Omitted by callers
     * that legitimately address a step without naming its parent (the
     * builder's `deleteSequenceStepAction`).
     */
    sequenceId?: string
  }): Promise<void> {
    const step = await db.query.sequenceStepModel.findFirst({
      where: {
        id: input.stepId,
      },
      with: {
        sequence: true,
      },
    })

    if (!step) {
      throw notFoundException("Step not found")
    }

    if (step.sequence.workspaceId !== input.workspaceId) {
      throw notFoundException("Step not found")
    }

    if (input.sequenceId && step.sequenceId !== input.sequenceId) {
      throw notFoundException("Step not found")
    }

    await db
      .delete(sequenceStepModel)
      .where(eq(sequenceStepModel.id, input.stepId))

    await recalculateAllContactsInSequence(step.sequenceId, input.workspaceId)
  }

  /**
   * Creates or updates a sequence step and recalculates contact schedules
   * when the change actually affects timing (see `shouldRecalculateOnUpdate`).
   */
  async upsertStep(input: {
    workspaceId: string
    sequenceId: string
    stepId?: string
    data: SequenceStepPayloadInput
  }): Promise<{ stepId: string }> {
    if (input.stepId) {
      // Pin the step to the sequence the caller named, so an update routed
      // through `/v1/sequences/{id}/steps` cannot edit a step belonging to a
      // different sequence in the same workspace.
      const { previousOrder, step } = await this.updateStep({
        workspaceId: input.workspaceId,
        stepId: input.stepId,
        sequenceId: input.sequenceId,
        data: input.data,
      })

      if (shouldRecalculateOnUpdate(input.data, previousOrder)) {
        await handleStepUpdateImpact(
          input.sequenceId,
          input.workspaceId,
          input.stepId,
          input.data.order,
        )
      }

      return { stepId: step.id }
    }

    const step = await this.createStep({
      workspaceId: input.workspaceId,
      sequenceId: input.sequenceId,
      data: input.data,
    })

    await handleStepCreationImpact(
      input.sequenceId,
      input.workspaceId,
      input.data.order,
    )

    return { stepId: step.id }
  }
}

export const sequenceService = new SequenceService()
