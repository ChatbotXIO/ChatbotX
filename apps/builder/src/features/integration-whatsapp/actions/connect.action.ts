"use server"

import type { UserModel } from "@chatbotx.io/database/types"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectWhatsappResult,
  type ConnectWhatsappSchema,
  connectWhatsappSchema,
} from "../schema"
import { connectWhatsappNumber } from "./connect-number"

/**
 * Server-action transport for the top-level connect form (manual / OAuth /
 * auto-select). The whole sequence lives in `connectWhatsappNumber`
 * (`./connect-number.ts`); the multi-select picker drives that same core
 * through the oRPC route instead, because Next serializes server actions
 * from one browser and the batch must connect numbers in parallel.
 */
export const connectWhatsappAction = authActionClient
  .inputSchema(connectWhatsappSchema)
  .action(
    ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: ConnectWhatsappSchema
    }): Promise<ConnectWhatsappResult> =>
      connectWhatsappNumber({ userId: ctx.user.id, input: parsedInput }),
  )
