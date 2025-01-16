"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type DeleteFieldBindSchema,
  deleteFieldBindSchema,
} from "../schemas/delete-field-schema"

export const deleteFieldsAction = authActionClient
  .bindArgsSchemas(deleteFieldBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, fieldType, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteFieldBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.field.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
          fieldType,
        },
      })

      revalidateTag(`${ctx.user.id}#fields#${fieldType}`)

      return {
        successful: true,
      }
    },
  )
