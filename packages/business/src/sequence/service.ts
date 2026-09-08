import {
  and,
  db,
  eq,
  findOrFail,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { sequenceModel, sequenceStepModel } from "@chatbotx.io/database/schema"
import type {
  SequenceModel,
  SequenceStepModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import {
  buildCreateData,
  buildUpdateData,
  type SequenceStepPayloadInput,
} from "./step-payload"

class SequenceService extends BaseService {
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

    await db
      .delete(sequenceStepModel)
      .where(eq(sequenceStepModel.id, input.stepId))
  }
}

export const sequenceService = new SequenceService()
