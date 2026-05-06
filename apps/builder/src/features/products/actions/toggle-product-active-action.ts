"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceActionClient } from "@/lib/safe-action"
import { productService } from "../services"

export const toggleProductActiveAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(z.object({ isActive: z.boolean() }))
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, productId],
      parsedInput: { isActive },
    }) => {
      await productService.update({
        productId,
        workspaceId,
        data: { isActive },
      })
    },
  )
