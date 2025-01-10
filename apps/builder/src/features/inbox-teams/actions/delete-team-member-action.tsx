"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma, User } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import { DeleteTeamMembersBindSchema, deleteTeamMembersBindSchema } from "../schemas/delete-team-member-schema"

export const deleteTeamMembersAction = authActionClient
  .bindArgsSchemas(deleteTeamMembersBindSchema)
  .action(async ({
    ctx,
    bindArgsParsedInputs: [chatbotId, ids, teamId],
  }: {
    ctx: { user: User }
    bindArgsParsedInputs: DeleteTeamMembersBindSchema
  }) => {

    await findChatbotOrFail(ctx.user.id, chatbotId)

    await prisma.teamMember.deleteMany({
      where: {
        id: {
          in: ids,
        },
        chatbotId,
        teamId
      },
    })

    revalidateTag(`${ctx.user.id}#teamMembers`)
    revalidateTag(`${ctx.user.id}#teams`);

    return {
      successful: true,
    }
  })
