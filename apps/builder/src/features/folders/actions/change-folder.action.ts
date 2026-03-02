"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import {
  automatedResponseModel,
  fieldModel,
  flowModel,
  tagModel,
} from "@aha.chat/database/schema"
import { returnValidationErrors } from "next-safe-action"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { BaseException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { changeFolderRequest } from "../schemas/action"
import { FolderException } from "../schemas/resource"

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
      throw new BaseException("Resource not found")
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
    case "tag":
      return tagModel
    case "flow":
      return flowModel
    case "customField":
      return fieldModel
    case "automatedResponse":
      return automatedResponseModel
    default:
      throw new FolderException("Invalid folder type")
  }
}
