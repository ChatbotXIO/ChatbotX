"use server"

import {
  type AssignConversationBindSchema,
  type AssignConversationSchema,
  assignConversationBindSchema,
  assignConversationSchema,
} from "@/features/conversations/schemas/assign-conversation-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { AssignedType, type User, prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"
import { revalidateTag } from "next/cache"

export const assignConversationAction = authActionClient
  .schema(assignConversationSchema)
  .bindArgsSchemas(assignConversationBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: AssignConversationSchema
      bindArgsParsedInputs: AssignConversationBindSchema
    }) => {
      if (parsedInput.assignedId && !parsedInput.assignedType) {
        return returnValidationErrors(assignConversationSchema, {
          _errors: ["Validation Exception"],
          ids: {
            _errors: ["Assign type is required."],
          },
        })
      }

      await findChatbotOrFail(ctx.user.id, chatbotId)
      const params = {
        chatbotId: chatbotId,
        id: {
          in: parsedInput.ids,
        },
      }

      const conversations = await prisma.contact.findMany({
        where: params,
      })
      if (conversations.length !== parsedInput.ids.length) {
        return returnValidationErrors(assignConversationSchema, {
          _errors: ["Validation Exception"],
          ids: {
            _errors: [
              "Conversation not exists on chatbot or conversation archived before.",
            ],
          },
        })
      }

      if (parsedInput.assignedType === AssignedType.User) {
        const user = await prisma.user.findFirst({
          where: { id: parsedInput.assignedId as string },
        })
        if (!user) {
          return returnValidationErrors(assignConversationSchema, {
            _errors: ["Validation Exception"],
            assignedId: {
              _errors: ["User is not exists."],
            },
          })
        }
      }

      if (parsedInput.assignedType === AssignedType.Team) {
        const user = await prisma.team.findFirst({
          where: { id: parsedInput.assignedId as string },
        })
        if (!user) {
          return returnValidationErrors(assignConversationSchema, {
            _errors: ["Validation Exception"],
            assignedId: {
              _errors: ["Team is not exists."],
            },
          })
        }
      }

      const data = {
        assignedId: parsedInput.assignedId,
        assignedType: parsedInput.assignedType,
      }

      await prisma.contact.updateMany({
        where: params,
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
