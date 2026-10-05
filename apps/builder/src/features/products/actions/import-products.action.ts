"use server"

import {
  importFormats,
  productImportMetaSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { startProductImportJob } from "../lib/start-product-import"

const importProductsRequest = z.object({
  fileId: zodBigintAsString(),
  format: z.enum([importFormats.enum.csv, importFormats.enum.xlsx]),
  meta: productImportMetaSchema,
})

export const importProductsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(importProductsRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }) =>
      await startProductImportJob({
        workspaceId,
        userId: user.id,
        fileId: parsedInput.fileId,
        format: parsedInput.format,
        meta: parsedInput.meta,
      }),
  )
