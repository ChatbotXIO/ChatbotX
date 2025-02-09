"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateFlowBindSchema,
  type UpdateFlowSchema,
  updateFlowBindSchema,
  updateFlowSchema,
} from "../schemas/update-flow-schema"

export const updateFlowAction = authActionClient
  .schema(updateFlowSchema)
  .bindArgsSchemas(updateFlowBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, flowId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateFlowSchema
      bindArgsParsedInputs: UpdateFlowBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.flow.update({
        where: {
          id: flowId,
        },
        data: parsedInput,
      })

      revalidateTag(`${chatbotId}#flows`)

      return {
        successful: true,
      }
    },
  )
