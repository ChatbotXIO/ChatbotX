"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toggleMediaLibraryFavourite } from "../queries/mutations"

export const toggleMediaLibraryFavouriteAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(zodBigintAsString())
  .action(async ({ bindArgsParsedInputs, parsedInput: fileId }) => {
    const [workspaceId] = bindArgsParsedInputs
    return await toggleMediaLibraryFavourite({ workspaceId, fileId })
  })
