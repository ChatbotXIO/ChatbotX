"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { mapExceptionToFieldError } from "@/lib/action-field-error"
import { workspaceActionClient } from "@/lib/safe-action"
import { type UpdateTagSchema, updateTagSchema } from "../schema/action"

export const updateTagAction = workspaceActionClient
  .inputSchema(updateTagSchema)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      parsedInput: UpdateTagSchema
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await mapExceptionToFieldError(
        updateTagSchema,
        "name",
        () => tagService.update({ workspaceId, id, data: parsedInput }),
        "tag",
      )
    },
  )
