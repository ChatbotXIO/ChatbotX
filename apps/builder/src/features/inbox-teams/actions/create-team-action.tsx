"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { CreateTeamBindSchema, createTeamBindSchema, createTeamSchema, CreateTeamSchema } from "../schemas/create-team-schema";

export const createTeamAction = authActionClient
  .schema(createTeamSchema)
  .bindArgsSchemas(createTeamBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId]
  }: {
    ctx: { user: User },
    parsedInput: CreateTeamSchema,
    bindArgsParsedInputs: CreateTeamBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    const existingTeam = await prisma.team.findFirst({
      where: {
        chatbotId,
        name: parsedInput.name,
      },
    });

    if (existingTeam) {
      throw new Error(`Team with the name "${parsedInput.name}" already exists.`);
    }

    const team = await prisma.team.create({
      data: {
        name: parsedInput.name,
        chatbotId,
      },
    });

    const newUserIds = parsedInput.userIds

    await prisma.teamMember.createMany({
      data: newUserIds.map(userId => ({
        userId,
        chatbotId,
        teamId: team.id,
      })),
    });


    revalidateTag(`${ctx.user.id}#teamMembers`)
    revalidateTag(`${ctx.user.id}#teams`);

    return { successful: true };
  })
