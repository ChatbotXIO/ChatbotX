"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma } from "@ahachat.ai/database";
import { User } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { deleteLogSchema } from "./delete-logs-schema";

export const deleteLogAction = authActionClient
  .schema(deleteLogSchema)
  .action(async ({
    ctx,
    parsedInput,
  }: {
    ctx: { user: User };
    parsedInput: z.infer<typeof deleteLogSchema>;
  }) => {
    try {

      console.log("Xem có id log không? ", parsedInput.ids)

      const { chatbot } = await findChatbotOrFail(ctx.user.id, parsedInput.chatbotId);

      await prisma.log.deleteMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId: chatbot.id,
        },
      });

      revalidateTag("logs");

      return {
        successful: true,
      };
    } catch (err) {
      console.error(err);

      return {
        successful: false,
        error: err,
      };
    }
  });
