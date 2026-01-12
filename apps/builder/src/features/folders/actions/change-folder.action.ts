"use server"

import { FolderType, prisma } from "@aha.chat/database"
import { rootFolderId } from "@aha.chat/database/enums"
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
    const resource = await resourceModel.findFirst({
      where: {
        chatbotId,
        id: parsedInput.modelId,
      },
      select: {
        id: true,
      },
    })
    if (!resource) {
      throw new BaseException("Resource not found")
    }

    let newFolderId: string | null = null
    const inputNewFolderId =
      parsedInput.newFolderId === rootFolderId ? null : parsedInput.newFolderId
    if (inputNewFolderId) {
      const targetFolder = await prisma.folder.findFirst({
        where: {
          chatbotId,
          id: parsedInput.newFolderId,
          folderType: parsedInput.folderType,
        },
        select: {
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

    // Try to find the folder
    await resourceModel.update({
      where: {
        id: resource.id,
      },
      data: {
        folderId: newFolderId,
      },
    })
  })

// biome-ignore lint/suspicious/noExplicitAny: skip checking prisma model
function findResourceModel(folderType: FolderType): any {
  switch (folderType) {
    case FolderType.tag:
      return prisma.tag
    case FolderType.flow:
      return prisma.flow
    case FolderType.customField:
      return prisma.field
    case FolderType.automatedResponse:
      return prisma.automatedResponse
    default:
      throw new FolderException("Invalid folder type")
  }
}
