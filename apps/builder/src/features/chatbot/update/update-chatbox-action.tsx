"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma } from "@ahachat.ai/database";
import { User } from "@prisma/client";
import { UpdateChatbotBindSchema, updateChatbotBindSchema, UpdateChatbotSchema, updateChatbotSchema } from "./update-chatbot-schema";

export const updateChatbotAction = authActionClient
  .schema(updateChatbotSchema)
  .bindArgsSchemas(updateChatbotBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId],
  }: {
    ctx: { user: User },
    parsedInput: UpdateChatbotSchema,
    bindArgsParsedInputs: UpdateChatbotBindSchema,
  }) => {

    await prisma.chatbot.update({
      where: { id: chatbotId },
      data: {
        defaultReply: parsedInput.defaultReply,
        targetCountry: parsedInput.targetCountry,
        defaultLanguage: parsedInput.defaultLanguage,
        accountTimezone: parsedInput.accountTimezone,
        brandColor: parsedInput.brandColor,
        developmentMode: parsedInput.developmentMode,
      },
    });

    return {
      successful: true,
    };
  });
