"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
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
      await updateTag({ workspaceId, id, data: parsedInput })
    },
  )

export const updateTag = async (props: {
  workspaceId: string
  id: string
  data: UpdateTagSchema
}) => await tagService.update(props)
