"use server";

import { findChatbotOrFail } from "@/lib/user-permissions";
import { ReadChatbotSchema } from "./read-chatbox-schema";
import { getCurrentUserId } from "@/auth";

export async function readChatboxAction(input: ReadChatbotSchema){
  const userId = await getCurrentUserId()

  const { chatbot } = await findChatbotOrFail(userId, input.id);

  if (!chatbot) {
    return {
      successful: false,
      error: "Chatbot not found",
    };
  }

  return {
    successful: true,
    data: chatbot,
  };
}
