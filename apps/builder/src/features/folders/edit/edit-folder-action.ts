"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma } from "@ahachat.ai/database";
import { returnValidationErrors } from "next-safe-action";
import {
  EditFolderBindSchema,
  editFolderBindSchema,
  EditFolderSchema,
  editFolderSchema
} from "@/features/folders/edit/edit-folder-schema";

export const editFolderAction = authActionClient
  .schema(editFolderSchema)
  .bindArgsSchemas(editFolderBindSchema)
  .action(async ({
    parsedInput,
    bindArgsParsedInputs: [chatbotId, folderId],
  }: {
    parsedInput: EditFolderSchema,
    bindArgsParsedInputs: EditFolderBindSchema
  }) => {
    const existedFolderId = await prisma.folder.findFirst({
      where: {
        chatbotId: chatbotId,
        id: folderId
      }
    })
    if (!existedFolderId) {
      throw new Error(`Folder ${parsedInput.name} is not existed!`)
    }
    const existedFolderName = await prisma.folder.findFirst({
      where: {
        chatbotId: chatbotId,
        name: parsedInput.name,
        group: existedFolderId.group,
        id: {
          not: folderId
        }
      }
    })
    if (existedFolderName) {
      return returnValidationErrors(editFolderSchema, {
        _errors: ["Validation Exception"],
        name: {
          _errors: [`Folder ${parsedInput.name} is existed!`]
        }
      });
    }

    await prisma.folder.update({ where: { id: folderId }, data: { name: parsedInput.name } })

    return {
      successful: true,
    }
  })
