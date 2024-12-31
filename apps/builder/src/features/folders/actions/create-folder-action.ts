"use server";

import {
  CreateFolderBindSchema,
  createFolderBindSchema,
  CreateFolderSchema,
  createFolderSchema
} from "@/features/folders/schemas/create-folder-schema";
import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma } from "@ahachat.ai/database";
import { Folder, User } from "@prisma/client";
import { revalidateTag } from "next/cache";

export const createFolderAction = authActionClient
  .schema(createFolderSchema)
  .bindArgsSchemas(createFolderBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, folderType, parentId]
  }: {
    ctx: { user: User },
    parsedInput: CreateFolderSchema,
    bindArgsParsedInputs: CreateFolderBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    let paths: string[] = []
    let parentFolder: Folder | null = null
    if (parentId) {
      parentFolder = await prisma.folder.findFirst({ where: { id: parentId } })
      if (!parentFolder) {
        throw new Error("Parent folder does not exists!")
      }

      paths = [...parentFolder.paths, parentFolder.id]
    }

    await prisma.folder.create({
      data: {
        ...parsedInput,
        chatbotId,
        parentId,
        folderType,
        paths,
      }
    })

    revalidateTag(`${ctx.user.id}#folders#${folderType}`)

    return {
      successful: true,
    }
  })
