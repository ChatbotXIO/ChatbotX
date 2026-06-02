"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { toggleProductActiveRequest } from "../schema/action"
import { productService } from "../services"

export const toggleProductActiveAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(toggleProductActiveRequest)
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
