"use server";

import { authActionClient } from "@/lib/safe-action";
import { createContactSchema } from "./create-contact-schema";
import { prisma } from "@ahachat.ai/database";
import { returnValidationErrors } from "next-safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";

export const createContactAction = authActionClient
  .schema(createContactSchema)
  .action(async ({ ctx, parsedInput }) => {
    const { chatbot } = await findChatbotOrFail(ctx.user.id, parsedInput.chatbotId)

    const existedContact = await prisma.contact.findFirst({ where: { chatbotId: chatbot.id, phoneNumber: parsedInput.phoneNumber } })
    if (existedContact) {
      return returnValidationErrors(createContactSchema, {
        _errors: ["Validation Exception"],
        phoneNumber: {
          _errors: ["Phone number is exists"]
        }
      });
    }

    await prisma.contact.create({ data: { ...parsedInput, chatbotId: chatbot.id, source: "web" } })

    return {
      successful: true,
    }
  })
