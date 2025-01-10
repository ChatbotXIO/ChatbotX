"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { UpdateTeamBindSchema, updateTeamBindSchema, UpdateTeamSchema, updateTeamSchema } from "../schemas/update-team-schema";

export const updateTeamAction = authActionClient
  .schema(updateTeamSchema)
  .bindArgsSchemas(updateTeamBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, teamId]
  }: {
    ctx: { user: User },
    parsedInput: UpdateTeamSchema,
    bindArgsParsedInputs: UpdateTeamBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId);

    const existingField = await prisma.team.findFirst({
      where: {
        name: parsedInput.name,
        chatbotId,
        NOT: {
          id: teamId,
        },
      },
    });

    if (existingField) {
      throw new Error(`Team with the name "${parsedInput.name}" already exists.`);
    }

    await prisma.team.update({
      where: {
        id: teamId,
        chatbotId
      },
      data: {
        name: parsedInput.name,
      },
    });

    revalidateTag(`${ctx.user.id}#teams`)

    return {
      successful: true,
    };
  })
