"use server"

import { workspaceContactFieldVisibilityService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateContactFieldsVisibilityRequest,
  updateContactFieldsVisibilityRequest,
} from "../schemas/visibility"

export const updateContactFieldsVisibilityAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateContactFieldsVisibilityRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpdateContactFieldsVisibilityRequest
    }) => {
      await workspaceContactFieldVisibilityService.setFieldsVisibility({
        workspaceId,
        items: parsedInput.items,
      })

      revalidateCacheTags([
        `workspaces:${workspaceId}#contact-field-visibility`,
      ])
    },
  )
