"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { unsubscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"

export const disconnectWhatsappAction = authActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationWhatsapp = await findOrFail({
        table: integrationWhatsappModel,
        where: {
          workspaceId,
          id,
        },
        message: "Integration Whatsapp not found",
      })

      await unsubscribeWebhook({
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
      })

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationWhatsappModel)
          .where(eq(integrationWhatsappModel.id, integrationWhatsapp.id))

        await tx
          .update(inboxModel)
          .set({ status: inboxStatuses.enum.disconnected })
          .where(eq(inboxModel.id, integrationWhatsapp.inboxId))
      })

      revalidateCacheTags(`workspaces:${workspaceId}#inboxes`)
    },
  )
