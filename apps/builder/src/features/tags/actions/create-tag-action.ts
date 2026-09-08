"use server"
import { tagService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createTagRequest } from "../schema/action"
export const createTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createTagRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      return await tagService.create({ workspaceId, data: parsedInput })
    } catch (error) {
      if (error instanceof ChatbotXException && error.code === "validation") {
        returnValidationErrors(createTagRequest, {
          name: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
