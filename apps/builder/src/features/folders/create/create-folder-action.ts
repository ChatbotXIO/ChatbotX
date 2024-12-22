"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma } from "@ahachat.ai/database";
import { returnValidationErrors } from "next-safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { User } from "@prisma/client";
import {
  CreateFolderBindSchema,
  createFolderBindSchema,
  CreateFolderSchema,
  createFolderSchema
} from "@/features/folders/create/create-folder-schema";

export const createFolderAction = authActionClient
  .schema(createFolderSchema)
  .bindArgsSchemas(createFolderBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, group, parentId]
  }: {
    ctx: { user: User },
    parsedInput: CreateFolderSchema,
    bindArgsParsedInputs: CreateFolderBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    const existedFolder = await prisma.folder.findFirst({
      where: {
        chatbotId: chatbotId,
        group: group,
        name: parsedInput.name
      }
    })
    if (existedFolder) {
      return returnValidationErrors(createFolderSchema, {
        _errors: ["Validation Exception"],
        name: {
          _errors: [`Folder ${parsedInput.name} is existed!`]
        }
      });
    }

    if (parentId) {
      const existedFolder = await prisma.folder.findFirst({ where: { id: parentId } })
      if (!existedFolder) {
        throw new Error("Parent folder not exists!")
      }
    }

    await prisma.folder.create({ data: { ...parsedInput, chatbotId, group, parentId } })

    return {
      successful: true,
    }
  })
