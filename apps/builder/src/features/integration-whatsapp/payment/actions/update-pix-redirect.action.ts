"use server"

import { integrationWhatsappService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"

const updatePixRedirectRequest = z.object({
  pixRedirectEnabled: z.boolean(),
})

/**
 * Turns Pix with redirect on or off for a WhatsApp number. Super admin only,
 * like the calling settings: it changes how every Pix payment button of the
 * number is sent. Same service call as the public `updatePaymentSettings`.
 * Bound as `.bind(null, workspaceId, integrationWhatsappId)`.
 */
export const updatePixRedirectAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updatePixRedirectRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
      parsedInput,
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)
      await integrationWhatsappService.updatePixRedirectEnabled({
        id: integrationWhatsappId,
        workspaceId,
        enabled: parsedInput.pixRedirectEnabled,
      })
      return { pixRedirectEnabled: parsedInput.pixRedirectEnabled }
    },
  )
