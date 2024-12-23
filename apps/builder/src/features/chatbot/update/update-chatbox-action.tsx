"use server";
import { authActionClient } from "@/lib/safe-action";
import { updateChatbotSchema } from "./update-chatbot-schema";
import { prisma } from "@ahachat.ai/database";
import { returnValidationErrors } from "next-safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";

export const updateChatboxAction = authActionClient
  .schema(updateChatbotSchema)
  .action(async ({ ctx, parsedInput }) => {
    const { chatbot } = await findChatbotOrFail(ctx.user, parsedInput.id);
    const existedChatbot = await prisma.chatbot.findFirst({
      where: { id: chatbot.id },
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
