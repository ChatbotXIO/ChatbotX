"use server";

import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, User } from "@ahachat.ai/database";
import { returnValidationErrors } from "next-safe-action";
import { CreateContactBindSchema, createContactBindSchema, CreateContactSchema, createContactSchema } from "./create-contact-schema";

export const createContactAction = authActionClient
  .schema(createContactSchema)
  .bindArgsSchemas(createContactBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId],
  }: {
    ctx: { user: User },
    parsedInput: CreateContactSchema,
    bindArgsParsedInputs: CreateContactBindSchema,
  }) => {
    const { chatbot } = await findChatbotOrFail(ctx.user.id, chatbotId)

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
