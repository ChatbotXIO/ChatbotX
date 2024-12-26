"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma } from "@ahachat.ai/database";
import { User } from "@prisma/client";
import { returnValidationErrors } from "next-safe-action";
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

    const existedChatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId },
    });

    if (!existedChatbot) {
      return returnValidationErrors(updateChatbotSchema, {
        _errors: ["Validation Exception"],
        id: {
          _errors: ["Chatbot not found"],
        },
      });
    }

    await prisma.chatbot.update({
      where: { id: parsedInput.id },
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
