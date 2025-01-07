"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { createFieldBindSchema, CreateFieldBindSchema, createFieldSchema, CreateFieldSchema } from "../schemas/create-field-schema";

export const createFieldAction = authActionClient
  .schema(createFieldSchema)
  .bindArgsSchemas(createFieldBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, folderId, fieldType]
  }: {
    ctx: { user: User },
    parsedInput: CreateFieldSchema,
    bindArgsParsedInputs: CreateFieldBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    const existingField = await prisma.field.findFirst({
      where: {
        name: parsedInput.name,
        chatbotId,
        fieldType
      },
    });

    if (existingField) {
      throw new Error(`Tag with the name "${parsedInput.name}" already exists.`);
    }

    await prisma.field.create({
      data: {
        ...parsedInput,
        chatbotId,
        folderId,
        fieldType
      }
    })

    revalidateTag(`${ctx.user.id}#fields#${fieldType}`)

    return {
      successful: true,
    }
  })
