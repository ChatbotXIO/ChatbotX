"use server"

import { mediaLibraryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

// The browser shrinks it further before inlining it in the Flow JSON.
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024

/** Reads a media-library image so the editor can inline it as base64. */
export const loadMediaLibraryImageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(z.object({ fileId: zodBigintAsString() }))
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await mediaLibraryService.readImage({
        workspaceId,
        fileId: parsedInput.fileId,
        maxBytes: MAX_SOURCE_IMAGE_BYTES,
      }),
  )
