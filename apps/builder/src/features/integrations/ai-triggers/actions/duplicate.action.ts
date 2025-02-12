"use server"

import {
  type DuplicateAITriggerBindSchema,
  duplicateAITriggerBindSchema,
} from "@/features/integrations/ai-triggers/schemas/duplicate.schema"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const duplicateAITriggerAction = authActionClient
  .bindArgsSchemas(duplicateAITriggerBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DuplicateAITriggerBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAITrigger = await prisma.aiTrigger.findFirst({
        select: {
          name: true,
          description: true,
          questions: true,
          flowId: true,
          finalMessage: true,
        },
        where: {
          id,
          chatbotId,
        },
      })

      const dupTrigger = await prisma.aiTrigger.create({
        data: {
          name: `${existingAITrigger?.name}_copy_${new Date().getTime()}`,
          chatbotId,
        },
      })

      await prisma.aiTrigger.update({
        where: {
          id: dupTrigger.id,
        },
        data: {
          description: existingAITrigger?.description,
          questions: existingAITrigger?.questions.length
            ? (existingAITrigger.questions as JsonObject[])
            : [],
          flowId: existingAITrigger?.flowId || "",
          finalMessage: existingAITrigger?.finalMessage || "",
        },
      })

      revalidateTag(`${ctx.user.id}#aiTriggers`)

      return {
        successful: true,
      }
    },
  )
