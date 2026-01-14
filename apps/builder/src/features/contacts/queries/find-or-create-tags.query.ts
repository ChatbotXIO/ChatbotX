"use server"

import { type Prisma, prisma } from "@aha.chat/database"

export type Tag = {
  id: string
  name: string
  chatbotId: string
  createdAt: Date
  updatedAt: Date
  folderId: string | null
  syncToMessenger: boolean
}

export async function findOrCreateTags(
  tx: Prisma.TransactionClient | null,
  chatbotId: string,
  tagNames: string[],
): Promise<{
  existingTags: Tag[]
  newlyCreatedTags: Tag[]
  allTags: Tag[]
}> {
  const prismaClient = tx || prisma

  const existingTags = await prismaClient.tag.findMany({
    where: {
      chatbotId,
      name: { in: tagNames },
    },
  })

  const existingTagNames = new Set(existingTags.map((t) => t.name))
  const missingTagNames = tagNames.filter((name) => !existingTagNames.has(name))

  let newlyCreatedTags: Tag[] = []

  if (missingTagNames.length > 0) {
    newlyCreatedTags = await prismaClient.tag.createManyAndReturn({
      data: missingTagNames.map((name) => ({
        name,
        chatbotId,
      })),
      skipDuplicates: true,
    })
  }

  const allTags = [...existingTags, ...newlyCreatedTags]

  return {
    existingTags,
    newlyCreatedTags,
    allTags,
  }
}
