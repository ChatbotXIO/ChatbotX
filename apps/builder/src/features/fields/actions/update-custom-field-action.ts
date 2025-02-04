"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateCustomFieldSchema,
  type UpdateFieldBindSchema,
  updateCustomFieldSchema,
  updateFieldBindSchema,
} from "../schemas/update-custom-field-schema"

export const updateCustomFieldAction = authActionClient
  .schema(updateCustomFieldSchema)
  .bindArgsSchemas(updateFieldBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, fieldId, fieldType],
    }: {
      ctx: { user: User }
      parsedInput: UpdateCustomFieldSchema
      bindArgsParsedInputs: UpdateFieldBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingField = await prisma.field.findFirst({
        where: {
          name: parsedInput.name,
          chatbotId,
          fieldType,
          NOT: {
            id: fieldId,
          },
        },
      })

      if (existingField) {
        throw new Error(
          `Tag with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.field.update({
        where: {
          id: fieldId,
          chatbotId,
          fieldType,
        },
        data: {
          name: parsedInput.name,
          description: parsedInput.description,
        },
      })

      revalidateTag(`${ctx.user.id}#fields#${fieldType}`)

      return {
        successful: true,
      }
    },
  )
