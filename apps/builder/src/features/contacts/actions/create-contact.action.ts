"use server"
import { contactService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createContactRequest } from "../schema/action"

export const createContactAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createContactRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const { contact } = await contactService.createWithInbox({
        workspaceId,
        input: parsedInput,
      })
      return contact
    } catch (error) {
      if (
        error instanceof ChatbotXException &&
        error.code === "validation" &&
        error.field
      ) {
        returnValidationErrors(createContactRequest, {
          _errors: ["Validation Exception"],
          [error.field]: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
