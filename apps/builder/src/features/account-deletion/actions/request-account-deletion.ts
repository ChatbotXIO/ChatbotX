"use server"

import { userService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { z } from "zod"
import { authActionClient } from "@/lib/safe-action"

export const requestAccountDeletion = authActionClient
  .inputSchema(z.object({ confirmation: z.literal("DELETE") }))
  .action(async ({ ctx }) => {
    try {
      await userService.requestAccountDeletion({
        actor: { userId: ctx.user.id },
        userId: ctx.user.id,
      })
      return { status: "success" as const }
    } catch (error) {
      if (
        error instanceof ChatbotXException &&
        error.code === "accountDeletionSupportRequired"
      ) {
        return { status: "supportRequired" as const }
      }
      throw error
    }
  })
