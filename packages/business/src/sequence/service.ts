import {
  and,
  db,
  eq,
  findOrFail,
  isDatabaseError,
} from "@chatbotx.io/database/client"
import { sequenceModel, sequenceStepModel } from "@chatbotx.io/database/schema"
import type {
  SequenceModel,
  SequenceStepModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { validationException } from "../errors"
import {
  buildCreateData,
  buildUpdateData,
  type SequenceStepPayloadInput,
} from "./step-payload"

const UNIQUE_VIOLATION_CODE = "23505"

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
      if (
        isDatabaseError(error) &&
        error.cause.code === UNIQUE_VIOLATION_CODE
      ) {
        throw validationException("name", "Name is already taken.")
      }
      throw error
    }

    await this.audit("create", `created a new sequence (#${sequenceId})`)

    return { sequenceId }
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
      throw new Error("Step not found")
    }

    if (step.sequence.workspaceId !== input.workspaceId) {
      throw new Error("Unauthorized: Step does not belong to this workspace")
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
      throw new Error("Step not found")
    }

    if (step.sequence.workspaceId !== input.workspaceId) {
      throw new Error("Unauthorized: Step does not belong to this workspace")
    }

    await db
      .delete(sequenceStepModel)
      .where(eq(sequenceStepModel.id, input.stepId))
  }
}

export const sequenceService = new SequenceService()
