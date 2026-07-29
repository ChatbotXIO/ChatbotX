"use server"

import { importService } from "@chatbotx.io/business"
import {
  importFormats,
  productImportMetaSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

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
    }) => {
      const row = await importService.startProductImport({
        workspaceId,
        userId: user.id,
        fileId: parsedInput.fileId,
        format: parsedInput.format,
        meta: parsedInput.meta,
      })
      try {
        await defaultQueue.add(
          DefaultJobAction.runImport,
          {
            type: DefaultJobAction.runImport,
            data: { importId: row.id },
          },
          { jobId: `import-products-${row.id}` },
        )
      } catch (error) {
        await importService.fail(row.id, "Unable to queue product import")
        throw error
      }
      return { importId: row.id }
    },
  )
