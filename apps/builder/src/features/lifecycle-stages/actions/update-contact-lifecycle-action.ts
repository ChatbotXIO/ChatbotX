"use server"

import { contactService } from "@chatbotx.io/business"
import { emitLifecycleStageChanged } from "@chatbotx.io/events"
import { revalidatePath } from "next/cache"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateContactLifecycleSchema } from "../schema/update-contact-lifecycle"

export const updateContactLifecycleAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateContactLifecycleSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: { contactId: string; lifecycleStageId: string | null }
    }) => {
      const transition = await contactService.updateLifecycleStage({
        contactId: parsedInput.contactId,
        workspaceId,
        lifecycleStageId: parsedInput.lifecycleStageId,
      })

      // Fire the trigger/webhook event only when the stage actually changed.
      if (transition) {
        await emitLifecycleStageChanged(
          workspaceId,
          transition.contactId,
          transition.toStageId,
          transition.fromStageId,
          transition.toStageName,
          transition.fromStageName,
        )
      }

      revalidatePath("/space", "layout")
    },
  )
