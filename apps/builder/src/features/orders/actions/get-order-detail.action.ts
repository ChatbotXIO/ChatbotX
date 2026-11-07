"use server"

import { orderService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/** The order with its lines, for the read-only Shopify details dialog. */
export const getOrderDetailAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, orderId] }) =>
      await orderService.getDetail({ workspaceId, orderId }),
  )
