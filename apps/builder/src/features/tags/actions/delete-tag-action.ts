"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma, User } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import { DeleteTagBindSchema, deleteTagBindSchema } from "../schemas/delete-tag-schema"

export const deleteTagAction = authActionClient
  .bindArgsSchemas(deleteTagBindSchema)
  .action(async ({
    ctx,
    bindArgsParsedInputs: [chatbotId, ids],
  }: {
    ctx: { user: User }
    bindArgsParsedInputs: DeleteTagBindSchema
  }) => {

    await findChatbotOrFail(ctx.user.id, chatbotId)

    await prisma.tag.deleteMany({
      where: {
        id: {
          in: ids,
        },
        chatbotId,
      },
    })

    revalidateTag(`${ctx.user.id}#tags`)

    return {
      successful: true,
    }
  })
