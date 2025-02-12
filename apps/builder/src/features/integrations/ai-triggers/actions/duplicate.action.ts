"use server"

import {
  type DuplicateAITriggerBindSchema,
  duplicateAITriggerBindSchema,
} from "@/features/integrations/ai-triggers/schemas/duplicate.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import type { InputJsonValue } from "@prisma/client/runtime/binary"
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

      const {
        id: eid,
        name,
        createdAt,
        updatedAt,
        questions,
        ...rest
      } = await prisma.aITrigger.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.aITrigger.create({
        data: {
          ...rest,
          name: `${name} _copy`,
          questions: questions as InputJsonValue[],
        },
      })

      revalidateTag(`${ctx.user.id}#aiTriggers`)

      return {
        successful: true,
      }
    },
  )
