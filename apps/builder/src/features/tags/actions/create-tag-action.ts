"use server"

import { db } from "@aha.chat/database/client"
import { tagModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import {
  type CreateTagSchema,
  createTagSchema,
} from "../schemas/create-tag-schema"
import { TagException } from "../schemas/error"

export const createTagAction = authActionClient
  .inputSchema(createTagSchema)
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: UserModel }
      parsedInput: CreateTagSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingTag = await db.query.tagModel.findFirst({
        columns: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })
      if (existingTag) {
        throw new TagException(
          `Tag with the name "${parsedInput.name}" already exists.`,
        )
      }

      if (parsedInput.folderId) {
        await ensureFolderIsExists(parsedInput.folderId, chatbotId, "tag")
      }

      await db.insert(tagModel).values({
        ...parsedInput,
        id: createId(),
        chatbotId,
      })

      revalidateCacheTags(`chatbots:${chatbotId}#tags`)
    },
  )
