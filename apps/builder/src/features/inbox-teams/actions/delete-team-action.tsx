"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { DeleteTeamBindSchema, deleteTeamBindSchema } from "../schemas/delete-team-schema";

export const deleteTeamAction = authActionClient
  .bindArgsSchemas(deleteTeamBindSchema)
  .action(async ({
    ctx,
    bindArgsParsedInputs: [chatbotId, id],
  }: {
    ctx: { user: User }
    bindArgsParsedInputs: DeleteTeamBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    await prisma.team.deleteMany({
      where: {
        id: id,
        chatbotId,
      },
    })

    revalidateTag(`${ctx.user.id}#teams`)

    return {
      successful: true,
    }
  })
