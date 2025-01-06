"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { CreateTagBindSchema, createTagBindSchema, CreateTagSchema, createTagSchema } from "../schemas/create-tag-schema";

export const createTagAction = authActionClient
  .schema(createTagSchema)
  .bindArgsSchemas(createTagBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, folderId]
  }: {
    ctx: { user: User },
    parsedInput: CreateTagSchema,
    bindArgsParsedInputs: CreateTagBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    const existingTag = await prisma.tag.findFirst({
      where: {
        name: parsedInput.name,
      },
    });

    if (existingTag) {
      throw new Error(`Tag with the name "${parsedInput.name}" already exists.`);
    }

    await prisma.tag.create({
      data: {
        ...parsedInput,
        chatbotId,
        folderId,
      }
    })

    revalidateTag(`${ctx.user.id}#tags`)

    return {
      successful: true,
    }
  })
