"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";
import { UpdateFieldValueBindSchema, updateFieldValueBindSchema, UpdateFieldValueSchema, updateFieldValueSchema } from "../schemas/update-field-value-schema";

export const updateFieldValueAction = authActionClient
  .schema(updateFieldValueSchema)
  .bindArgsSchemas(updateFieldValueBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, fieldId, fieldType]
  }: {
    ctx: { user: User },
    parsedInput: UpdateFieldValueSchema,
    bindArgsParsedInputs: UpdateFieldValueBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId);

    await prisma.field.update({
      where: {
        id: fieldId,
        chatbotId,
        fieldType
      },
      data: {
        value: parsedInput.value,
      },
    });

    revalidateTag(`${ctx.user.id}#fields#${fieldType}`)

    return {
      successful: true,
    };
  })
