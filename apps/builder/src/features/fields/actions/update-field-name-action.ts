"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { UpdateFieldNameBindSchema, updateFieldNameBindSchema, UpdateFieldNameSchema, updateFieldNameSchema } from "../schemas/update-field-name-schema";

export const updateFieldNameAction = authActionClient
  .schema(updateFieldNameSchema)
  .bindArgsSchemas(updateFieldNameBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, fieldId, fieldType]
  }: {
    ctx: { user: User },
    parsedInput: UpdateFieldNameSchema,
    bindArgsParsedInputs: UpdateFieldNameBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId);

    const existingField = await prisma.field.findFirst({
      where: {
        name: parsedInput.name,
        chatbotId,
        fieldType,
        NOT: {
          id: fieldId,
        },
      },
    });

    if (existingField) {
      throw new Error(`Tag with the name "${parsedInput.name}" already exists.`);
    }

    await prisma.field.update({
      where: {
        id: fieldId,
        chatbotId,
        fieldType
      },
      data: {
        name: parsedInput.name,
        description: parsedInput.description,
      },
    });

    revalidateTag(`${ctx.user.id}#fields#${fieldType}`)

    return {
      successful: true,
    };
  })
