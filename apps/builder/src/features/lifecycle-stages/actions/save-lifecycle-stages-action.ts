"use server"

import { lifecycleStageService } from "@chatbotx.io/business"
import { revalidatePath } from "next/cache"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { saveLifecycleStagesSchema } from "../schema"

/**
 * Salva todas as etapas em batch (4 fases): delete, reset defaults, insert, update.
 * Estado vem do front com flags _new/_dirty/_deleted.
 */
export const saveLifecycleStagesAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(saveLifecycleStagesSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: {
        stages: Array<{
          id: string
          key: string
          name: string
          icon: string | null
          color: string | null
          position: number
          isDefault: boolean
          isLost: boolean
          _new?: boolean
          _dirty?: boolean
          _deleted?: boolean
        }>
      }
    }) => {
      const stages = parsedInput.stages

      // FASE 1: Deletar (existentes marcados _deleted)
      const toDelete = stages.filter((s) => s._deleted && !s._new)
      for (const s of toDelete) {
        await lifecycleStageService.delete({ id: s.id, workspaceId })
      }

      // FASE 2: Insert novos
      const toInsert = stages.filter((s) => s._new && !s._deleted)
      for (const s of toInsert) {
        await lifecycleStageService.create({
          workspaceId,
          data: {
            key: s.key,
            name: s.name,
            icon: s.icon,
            color: s.color,
            position: s.position,
            isDefault: s.isDefault,
            isLost: s.isLost,
          },
        })
      }

      // FASE 3: Update existentes (_dirty mas não _new nem _deleted)
      const toUpdate = stages.filter((s) => s._dirty && !s._new && !s._deleted)
      for (const s of toUpdate) {
        await lifecycleStageService.update({
          id: s.id,
          workspaceId,
          data: {
            name: s.name,
            icon: s.icon,
            color: s.color,
            position: s.position,
            isDefault: s.isDefault,
            isLost: s.isLost,
          },
        })
      }

      revalidatePath("/space", "layout")
    },
  )
