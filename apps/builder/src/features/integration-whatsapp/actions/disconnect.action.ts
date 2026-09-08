"use server"

import {
  integrationWhatsappService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { isRevokedTokenError } from "@chatbotx.io/integration-whatsapp"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { integrations } from "@/integration"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectWhatsappAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const [integrationWhatsapp, workspace] = await Promise.all([
        findOrFail({
          table: integrationWhatsappModel,
          where: {
            workspaceId,
            id,
          },
          message: "Integration Whatsapp not found",
        }),
        workspaceService.findById({ id: workspaceId }),
      ])

      try {
        await integrations.whatsapp.disconnect(
          integrationWhatsapp.auth as WhatsappAuthValue,
        )
      } catch (error) {
        if (!isRevokedTokenError(error)) {
          throw error
        }
      }

      await db.transaction((tx) =>
        integrationWhatsappService.disconnect({
          integrationWhatsapp,
          ownerId: workspace.ownerId,
          workspaceId,
          tx,
        }),
      )

      await auditService.record({
        action: "disconnect",
        detail: `disconnected the WhatsApp channel (#${integrationWhatsapp.id})`,
      })
    },
  )
