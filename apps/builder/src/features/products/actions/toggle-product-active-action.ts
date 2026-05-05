"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { productModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

export const toggleProductActiveAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(z.object({ isActive: z.boolean() }))
  .action(
    async ({
      bindArgsParsedInputs: [_workspaceId, productId],
      parsedInput: { isActive },
    }) => {
      await db
        .update(productModel)
        .set({ isActive })
        .where(eq(productModel.id, productId))
    },
  )
