"use server"

import { contactService, lifecycleStageService } from "@chatbotx.io/business"
import { emitLifecycleStageChanged } from "@chatbotx.io/events"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteLifecycleStageSchema = z.object({
  stageId: z.string(),
  reassignToStageId: z.string().nullable(),
})

/**
 * Apaga uma etapa migrando todos os contatos pra outra etapa (ou null = sem etapa).
 */
export const deleteLifecycleStageWithReassignAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteLifecycleStageSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: { stageId: string; reassignToStageId: string | null }
    }) => {
      const { count, transitions } =
        await contactService.reassignLifecycleStage({
          workspaceId,
          fromStageId: parsedInput.stageId,
          toStageId: parsedInput.reassignToStageId,
        })

      await lifecycleStageService.delete({
        id: parsedInput.stageId,
        workspaceId,
      })

      // Emit events for each reassigned contact so user-defined triggers can
      // run (e.g. "when lifecycle changes to 'Cliente', send welcome flow").
      await Promise.all(
        transitions.map((t) =>
          emitLifecycleStageChanged(
            workspaceId,
            t.contactId,
            t.toStageId,
            t.fromStageId,
            t.toStageName,
            t.fromStageName,
          ),
        ),
      )

      revalidatePath("/space", "layout")
      return { moved: count }
    },
  )

export const countContactsByStageSchema = z.object({
  stageId: z.string(),
})

/**
 * Conta contatos numa etapa específica (usado pra mostrar no modal).
 */
export const countContactsByStageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(countContactsByStageSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: { stageId: string }
    }) => {
      const count = await contactService.countByLifecycleStage({
        workspaceId,
        lifecycleStageId: parsedInput.stageId,
      })
      return { count }
    },
  )
