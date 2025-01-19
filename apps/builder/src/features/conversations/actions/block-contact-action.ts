"use server"

import {
  type BlockContactBindSchema,
  type BlockContactSchema,
  blockContactBindSchema,
  blockContactSchema,
} from "@/features/conversations/schemas/block-contact-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"
import { revalidateTag } from "next/cache"

export const blockContactAction = authActionClient
  .schema(blockContactSchema)
  .bindArgsSchemas(blockContactBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: BlockContactSchema
      bindArgsParsedInputs: BlockContactBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)
      const params = {
        chatbotId: chatbotId,
        id: {
          in: parsedInput.ids,
        },
      }

      const conversations = await prisma.conversation.findMany({
        where: params,
      })
      if (conversations.length !== parsedInput.ids.length) {
        return returnValidationErrors(blockContactSchema, {
          _errors: ["Validation Exception"],
          ids: {
            _errors: [
              "Conversation not exists on chatbot or conversation archived before.",
            ],
          },
        })
      }
      const data = { blockedAt: new Date() }

      await prisma.conversation.updateMany({
        where: {
          ...params,
          blockedAt: null,
        },
        data,
      })
      for (const id of parsedInput.ids) {
        revalidateTag(`conversations#${id}`)
      }

      return {
        successful: true,
        data,
      }
    },
  )
