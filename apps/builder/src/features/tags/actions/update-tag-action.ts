"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { UpdateTagBindSchema, updateTagBindSchema, UpdateTagSchema, updateTagSchema } from "../schemas/update-tag-schema";

export const updateTagAction = authActionClient
  .schema(updateTagSchema)
  .bindArgsSchemas(updateTagBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, tagId]
  }: {
    ctx: { user: User },
    parsedInput: UpdateTagSchema,
    bindArgsParsedInputs: UpdateTagBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId);

    const existingTag = await prisma.tag.findFirst({
      where: {
        name: parsedInput.name,
      },
    });

    if (existingTag) {
      throw new Error(`Tag with the name "${parsedInput.name}" already exists.`);
    }

    await prisma.tag.update({
      where: {
        id: tagId,
        chatbotId
      },
      data: {
        name: parsedInput.name,
      },
    });

    revalidateTag(`${ctx.user.id}#tags`);

    return {
      successful: true,
    };
  })
