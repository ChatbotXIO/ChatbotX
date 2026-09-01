"use server"

import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateWhatsappProfileRequest } from "../schema/update-whatsapp-profile.request"

export const updateWhatsappProfileAction = workspaceActionClient
  .inputSchema(updateWhatsappProfileRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async () =>
      await {
        success: true,
      },
  )
