import { z } from "zod"
export const setAllContactTagsPublicRequest = z.object({
  identifier: z.string().min(1),
  tags: z
    .array(z.string().trim().min(1))
    .max(100)
    .describe(
      "Tag names — not ids. Existing tags whose name matches are reused; unmatched names are created as new tags.",
    ),
})
export type SetAllContactTagsPublicRequest = z.infer<
  typeof setAllContactTagsPublicRequest
>

export const addTagsByNamePublicRequest = z.object({
  identifier: z.string().min(1),
  tags: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(100)
    .describe(
      "Tag names — not ids. Existing tags whose name matches are reused; unmatched names are created as new tags.",
    ),
})
export type AddTagsByNamePublicRequest = z.infer<
  typeof addTagsByNamePublicRequest
>
