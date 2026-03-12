"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { tagModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"

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
  tx: typeof db | null,
  chatbotId: string,
  tagNames: string[],
): Promise<{
  existingTags: Tag[]
  newlyCreatedTags: Tag[]
  allTags: Tag[]
}> {
  const dbClient = tx || db

  const existingTags = await dbClient.query.tagModel.findMany({
    where: and(
      eq(tagModel.chatbotId, chatbotId),
      inArray(tagModel.name, tagNames),
    ),
  })

  const existingTagNames = new Set(existingTags.map((t) => t.name))
  const missingTagNames = tagNames.filter((name) => !existingTagNames.has(name))

  let newlyCreatedTags: Tag[] = []

  if (missingTagNames.length > 0) {
    newlyCreatedTags = await dbClient
      .insert(tagModel)
      .values(
        missingTagNames.map((name) => ({
          id: createId(),
          name,
          chatbotId,
        })),
      )
      .onConflictDoNothing()
      .returning()
  }

  const allTags = [...existingTags, ...newlyCreatedTags]

  return {
    existingTags,
    newlyCreatedTags,
    allTags,
  }
}
