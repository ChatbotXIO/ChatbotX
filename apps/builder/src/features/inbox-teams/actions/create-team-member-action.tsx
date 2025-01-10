"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { CreateTeamMemberBindSchema, createTeamMemberBindSchema, CreateTeamMemberSchema, createTeamMemberSchema } from "../schemas/create-team-member-schema";

export const createTeamMemberAction = authActionClient
  .schema(createTeamMemberSchema)
  .bindArgsSchemas(createTeamMemberBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, teamId]
  }: {
    ctx: { user: User },
    parsedInput: CreateTeamMemberSchema,
    bindArgsParsedInputs: CreateTeamMemberBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    const existingMembers = await prisma.teamMember.findMany({
      where: {
        userId: {
          in: parsedInput.userIds,
        },
        chatbotId,
        teamId,
      },
      select: {
        userId: true,
      },
    });

    const existingUserIds = new Set(existingMembers.map(member => member.userId));

    const newUserIds = parsedInput.userIds.filter(userId => !existingUserIds.has(userId));

    if (newUserIds.length === 0) {
      throw new Error("All provided users are already members of this team.");
    }

    await prisma.teamMember.createMany({
      data: newUserIds.map(userId => ({
        userId,
        chatbotId,
        teamId,
      })),
    });

    revalidateTag(`${ctx.user.id}#teamMembers`)
    revalidateTag(`${ctx.user.id}#teams`)

    return {
      successful: true,
    }
  })
