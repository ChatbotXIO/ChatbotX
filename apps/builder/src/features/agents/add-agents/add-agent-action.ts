"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"
import { addAgentSchema } from "./add-agent-schema"

export const addAgentAction = authActionClient
  .schema(addAgentSchema)
  .action(async ({ ctx, parsedInput }) => {
    try {
      const { chatbot } = await findChatbotOrFail(
        ctx.user.id,
        parsedInput.chatbotId,
      )

      const existingMember = await prisma.chatbotMember.findFirst({
        where: { chatbotId: chatbot.id, userId: parsedInput.userId },
      })

      if (existingMember) {
        return returnValidationErrors(addAgentSchema, {
          _errors: ["Validation Exception"],
          userId: {
            _errors: ["User is already a member of this chatbot"],
          },
        })
      }

      await prisma.chatbotMember.create({
        data: {
          chatbotId: chatbot.id,
          userId: parsedInput.userId,
          role: parsedInput.role,
          isAdmin: parsedInput.isAdmin,
          enableAnalytics: parsedInput.enableAnalytics,
          enableFlows: parsedInput.enableFlows,
          enableContacts: parsedInput.enableContacts,
          enableOnlyAssignedContacts: parsedInput.enableOnlyAssignedContacts,
          enableEmailAndPhone: parsedInput.enableEmailAndPhone,
          enableBroadcast: parsedInput.enableBroadcast,
          enableEcommerce: parsedInput.enableEcommerce,
        },
      })

      return {
        successful: true,
      }
    } catch (error) {
      console.error("Error adding agent:", error)
      return {
        successful: false,
        error: "An unexpected error occurred.",
      }
    }
  })
