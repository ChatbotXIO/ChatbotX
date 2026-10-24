"use server"

import { orderService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { cancelOrderRequest, transitionOrderRequest } from "../schema/action"

/**
 * Accept, ship or complete — the same `orderService.transition` the
 * `orders.accept`/`ship`/`conclude` public procedures call.
 */
export const transitionOrderAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(transitionOrderRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId, orderId],
      parsedInput,
    }) => {
      await orderService.transition({
        workspaceId,
        orderId,
        to: parsedInput.to,
        actor: { type: "user", userId: user.id },
        message: parsedInput.message,
      })
    },
  )

/**
 * Cancel, as `orders.cancel`. Still allowed once the trial expired (a
 * read/delete-only workspace must be able to wind its orders down and give
 * the stock back), like deleting an order.
 */
export const cancelOrderAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(cancelOrderRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId, orderId],
      parsedInput,
    }) => {
      await orderService.transition({
        workspaceId,
        orderId,
        to: "cancelled",
        actor: { type: "user", userId: user.id },
        message: parsedInput.message,
      })
    },
  )
