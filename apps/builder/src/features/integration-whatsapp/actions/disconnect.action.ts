"use server"

import {
  integrationWhatsappService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
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
        integrationWhatsappService.findByIdForWorkspace({
          workspaceId,
          id,
        }),
        workspaceService.findById({ id: workspaceId }),
      ])

      if (!integrationWhatsapp) {
        throw new Error("Integration Whatsapp not found")
      }

      try {
        await integrations.whatsapp.disconnect(
          integrationWhatsapp.auth as WhatsappAuthValue,
        )
      } catch (error) {
        if (!isRevokedTokenError(error)) {
          throw error
        }
      }

      await integrationWhatsappService.deleteWithCleanup({
        workspaceId,
        id: integrationWhatsapp.id,
        phoneNumberId: integrationWhatsapp.phoneNumberId,
        inboxId: integrationWhatsapp.inboxId,
        ownerId: workspace.ownerId,
      })

      await auditService.record({
        action: "disconnect",
        detail: `disconnected the WhatsApp channel (#${integrationWhatsapp.id})`,
      })
    },
  )
