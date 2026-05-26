"use server"

import { contactService } from "@chatbotx.io/business"
import { emitLifecycleStageChanged } from "@chatbotx.io/events"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const bulkUpdateContactLifecycleSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(1000),
  lifecycleStageId: z.string().nullable(),
})

export const bulkUpdateContactLifecycleAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateContactLifecycleSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: { contactIds: string[]; lifecycleStageId: string | null }
    }) => {
      const { count, transitions } =
        await contactService.bulkUpdateLifecycleStage({
          contactIds: parsedInput.contactIds,
          workspaceId,
          lifecycleStageId: parsedInput.lifecycleStageId,
        })

      // Fan-out one event per contact whose stage actually changed.
      // Done in parallel so 1000 transitions don't serialize a slow loop.
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
      return { updated: count }
    },
  )
