import { z } from "zod"
import { tagResource } from "@/features/tags/schemas/resource"

export const addContactTagRequest = z.object({
  ids: z.array(z.bigint()),
  tags: z.array(z.string().trim().min(1)).min(1),
})
export type AddContactTagRequest = z.infer<typeof addContactTagRequest>

export const updateContactTagRequest = z.object({
  contactId: z.bigint(),
  tags: z.array(z.string().trim()),
})
export type UpdateContactTagRequest = z.infer<typeof updateContactTagRequest>

export const removeContactTagsRequest = z.object({
  ids: z.array(z.bigint()),
  tags: z.array(z.string()),
})
export type RemoveContactTagsRequest = z.infer<typeof removeContactTagsRequest>

export const listContactTagsRequest = z.object({
  chatbotId: z.bigint(),
  contactId: z.bigint(),
})
export type ListContactTagsRequest = z.infer<typeof listContactTagsRequest>

export const listContactTagsResponse = z.object({
  data: z.array(tagResource),
})
export type ListContactTagsResponse = z.infer<typeof listContactTagsResponse>

export const removeContactTagRequest = z.object({
  contactId: z.bigint(),
  tagId: z.string(),
})
export type RemoveContactTagRequest = z.infer<typeof removeContactTagRequest>
