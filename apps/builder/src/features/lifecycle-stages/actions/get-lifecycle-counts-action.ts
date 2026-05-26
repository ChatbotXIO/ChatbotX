"use server"

import { lifecycleStageService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { getCurrentUserId } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type GetLifecycleCountsRequest,
  getLifecycleCountsRequest,
} from "../schema/counts"

// Atualiza contagens do sidebar do Inbox: badge de cada lifecycle stage
// (conversas abertas no stage) + badge dos filtros top (Todos/Minhas/
// Não atribuídas/teams). Polling de 30s pra ficar fresco quando uma
// conversa muda de stage / é arquivada / é atribuída.
//
// Retorna { byStage, byAssignment } numa única chamada (mais eficiente
// que 2 actions separadas).
export const getLifecycleCountsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(getLifecycleCountsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: GetLifecycleCountsRequest
    }) => {
      const currentUserId = (await getCurrentUserId()) ?? ""
      const [byStage, byAssignment, unreadByStage, unreadByAssignment] =
        await Promise.all([
          lifecycleStageService.countOpenConversationsByStage({ workspaceId }),
          lifecycleStageService.countOpenConversationsByAssignment({
            workspaceId,
            currentUserId,
            teamIds: parsedInput.teamIds ?? [],
          }),
          lifecycleStageService.countUnreadByStage({ workspaceId }),
          lifecycleStageService.countUnreadByAssignment({
            workspaceId,
            currentUserId,
            teamIds: parsedInput.teamIds ?? [],
          }),
        ])
      return { byStage, byAssignment, unreadByStage, unreadByAssignment }
    },
  )
