"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { sequenceModel, sequenceStepModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { recalculateAllContactsInSequence } from "@/features/contact-sequences/utils/calculate-next-run-at"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

const deleteSequenceStepRequest = z.object({
  stepId: zodBigintAsString(),
  sequenceId: zodBigintAsString(),
})

type DeleteSequenceStepRequest = z.infer<typeof deleteSequenceStepRequest>

async function validateSequenceOwnership(
  sequenceId: string,
  workspaceId: string,
) {
  await findOrFail({
    table: sequenceModel,
    where: {
      id: sequenceId,
      workspaceId,
    },
    message: "Sequence not found",
  })
}

async function deleteStep(stepId: string, workspaceId: string) {
  const step = await db.query.sequenceStepModel.findFirst({
    where: {
      id: stepId,
    },
    with: {
      sequence: true,
    },
  })

  if (!step) {
    throw new Error("Step not found")
  }

  if (step.sequence.workspaceId !== workspaceId) {
    throw new Error("Unauthorized: Step does not belong to this workspace")
  }

  await db.delete(sequenceStepModel).where(eq(sequenceStepModel.id, stepId))
}

export const deleteSequenceStepAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteSequenceStepRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: DeleteSequenceStepRequest
    }) => {
      const { stepId, sequenceId } = parsedInput

      await validateSequenceOwnership(sequenceId, workspaceId)
      await deleteStep(stepId, workspaceId)
      await recalculateAllContactsInSequence(sequenceId, workspaceId)

      revalidateCacheTags([`workspaces:${workspaceId}#sequences`])

      return { success: true }
    },
  )
