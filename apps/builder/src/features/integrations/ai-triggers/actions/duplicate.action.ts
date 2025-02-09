"use server"

import {
  type DuplicateAiTriggerBindSchema,
  duplicateAiTriggerBindSchema,
} from "@/features/integrations/ai-triggers/schemas/duplicate.schema"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const duplicateAiTriggerAction = authActionClient
  .bindArgsSchemas(duplicateAiTriggerBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DuplicateAiTriggerBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiTrigger = await prisma.aiTrigger.findFirst({
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
          name: `${existingAiTrigger?.name}_copy_${new Date().getTime()}`,
          chatbotId,
        },
      })

      await prisma.aiTrigger.update({
        where: {
          id: dupTrigger.id,
        },
        data: {
          description: existingAiTrigger?.description,
          questions: existingAiTrigger?.questions.length
            ? (existingAiTrigger.questions as JsonObject[])
            : [],
          flowId: existingAiTrigger?.flowId || "",
          finalMessage: existingAiTrigger?.finalMessage || "",
        },
      })

      revalidateTag(`${ctx.user.id}#aiTriggers`)

      return {
        successful: true,
      }
    },
  )
