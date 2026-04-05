"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { folderTypes, rootFolderId } from "@chatbotx.io/database/partials"
import {
  automatedResponseModel,
  customFieldModel,
  flowModel,
  sequenceModel,
  tagModel,
  triggerModel,
  webhookModel,
} from "@chatbotx.io/database/schema"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { changeFolderRequest } from "../schema/action"

export const changeFolderAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(changeFolderRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs

    const resourceModel = findResourceModel(parsedInput.folderType)

    const resources = await db
      .select({
        id: resourceModel.id,
      })
      .from(resourceModel)
      .where(
        and(
          eq(resourceModel.workspaceId, workspaceId),
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
          workspaceId,
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
          eq(resourceModel.workspaceId, workspaceId),
          inArray(resourceModel.id, parsedInput.modelIds),
        ),
      )
  })

function findResourceModel(folderType: string) {
  switch (folderType) {
    case folderTypes.enum.tag:
      return tagModel
    case folderTypes.enum.flow:
      return flowModel
    case folderTypes.enum.customField:
      return customFieldModel
    case folderTypes.enum.automatedResponse:
      return automatedResponseModel
    case folderTypes.enum.sequence:
      return sequenceModel
    case folderTypes.enum.trigger:
      return triggerModel
    case folderTypes.enum.webhook:
      return webhookModel
    default:
      throw new ChatbotXException("Invalid folder type")
  }
}
