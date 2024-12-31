"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma } from "@ahachat.ai/database";
import { User } from "@prisma/client";
import { returnValidationErrors } from "next-safe-action";
import { revalidateTag } from "next/cache";
import { DeleteLogSchema, deleteLogSchema } from "./delete-logs-schema";

export const deleteLogAction = authActionClient
  .schema(deleteLogSchema)
  .action(async ({
    ctx,
    parsedInput,
  }: {
    ctx: { user: User };
    parsedInput: DeleteLogSchema;
  }) => {

    const { chatbot } = await findChatbotOrFail(ctx.user.id, parsedInput.chatbotId);

    if (!chatbot) {
      return returnValidationErrors(deleteLogSchema, {
        _errors: ["Delete Exception"],
      })
    }

    await prisma.log.deleteMany({
      where: {
        id: {
          in: parsedInput.ids,
        },
        chatbotId: chatbot.id,
      },
    });

    revalidateTag(`${ctx.user.id}#logs`);

    return {
      successful: true,
    };
  });
