"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { FolderType, rootFolderId } from "@aha.chat/database/enums"
import {
  automatedResponseModel,
  customFieldModel,
  flowModel,
  sequenceModel,
  tagModel,
  triggerModel,
  webhookModel,
} from "@aha.chat/database/schema"
import { returnValidationErrors } from "next-safe-action"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { ChatbotXException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { changeFolderRequest } from "../schemas/action"

export const changeFolderAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(changeFolderRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [chatbotId] = bindArgsParsedInputs

    const resourceModel = findResourceModel(parsedInput.folderType)

    const resources = await db
      .select({
        id: resourceModel.id,
      })
      .from(resourceModel)
      .where(
        and(
          eq(resourceModel.chatbotId, chatbotId),
          inArray(resourceModel.id, parsedInput.modelIds),
        ),
      )
    if (!resources || resources.length === 0) {
      throw new ChatbotXException("Resource not found")
    }

    let newFolderId: string | null = null
    const inputNewFolderId =
      parsedInput.newFolderId === rootFolderId ? null : parsedInput.newFolderId
    if (inputNewFolderId) {
      const targetFolder = await db.query.folderModel.findFirst({
        where: {
          chatbotId,
          id: parsedInput.newFolderId,
          folderType: parsedInput.folderType,
        },
        columns: {
          id: true,
        },
      })
      if (!targetFolder) {
        return returnValidationErrors(changeFolderRequest, {
          newFolderId: {
            _errors: ["Target folder not found"],
          },
        })
      }

      newFolderId = targetFolder.id
    }

    // Update all resources
    await db
      .update(resourceModel)
      .set({
        folderId: newFolderId,
      })
      .where(
        and(
          eq(resourceModel.chatbotId, chatbotId),
          inArray(resourceModel.id, parsedInput.modelIds),
        ),
      )
  })

function findResourceModel(folderType: string) {
  switch (folderType) {
    case FolderType.tag:
      return tagModel
    case FolderType.flow:
      return flowModel
    case FolderType.customField:
      return customFieldModel
    case FolderType.automatedResponse:
      return automatedResponseModel
    case FolderType.sequence:
      return sequenceModel
    case FolderType.trigger:
      return triggerModel
    case FolderType.webhook:
      return webhookModel
    default:
      throw new ChatbotXException("Invalid folder type")
  }
}
