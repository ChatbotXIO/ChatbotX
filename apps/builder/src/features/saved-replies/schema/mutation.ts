import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { savedReplyResource } from "./resource"

// Paridade Respond.io (gap #12 — 2026-05-27).
export const MAX_SNIPPETS_PER_WORKSPACE = 5000
export const MAX_TOPICS_PER_SNIPPET = 10
export const MAX_FILES_PER_SNIPPET = 5

// Anexo de snippet — mesmo shape do SavedReplyFile no schema DB.
export const snippetFileSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  size: z.number().int().nonnegative(),
  mimeType: z.string().max(100),
})
export type SnippetFile = z.infer<typeof snippetFileSchema>

export const listSavedRepliesRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListSavedRepliesRequest = z.infer<typeof listSavedRepliesRequest>

export const createSavedReplyRequest = z.object({
  name: z.string().trim().max(100).optional(),
  shortcut: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(2000),
  topics: z
    .array(z.string().trim().min(1).max(50))
    .max(MAX_TOPICS_PER_SNIPPET)
    .optional(),
  files: z.array(snippetFileSchema).max(MAX_FILES_PER_SNIPPET).optional(),
})
export type CreateSavedReplyRequest = z.infer<typeof createSavedReplyRequest>

export const editSavedReplyRequest = createSavedReplyRequest
export type EditSavedReplyRequest = z.infer<typeof editSavedReplyRequest>

export const deleteSavedReplyRequest = z.object({
  id: zodBigintAsString(),
})
export type DeleteSavedReplyRequest = z.infer<typeof deleteSavedReplyRequest>

export const listSavedReplyResponse = z.object({
  data: z.array(savedReplyResource),
})
export type ListSavedReplyResponse = z.infer<typeof listSavedReplyResponse>
