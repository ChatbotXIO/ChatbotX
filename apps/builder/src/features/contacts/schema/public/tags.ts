import { z } from "zod"

const tagNamesDescription =
  "Tag names — not ids. Existing tags whose name matches are reused; unmatched names are created as new tags."

export const setAllContactTagsPublicRequest = z.object({
  identifier: z.string().min(1),
  tags: z
    .array(z.string().trim().min(1))
    .max(100)
    .describe(tagNamesDescription),
})
export type SetAllContactTagsPublicRequest = z.infer<
  typeof setAllContactTagsPublicRequest
>

export const addTagsByNamePublicRequest = setAllContactTagsPublicRequest.extend(
  {
    tags: setAllContactTagsPublicRequest.shape.tags.min(1),
  },
)
export type AddTagsByNamePublicRequest = z.infer<
  typeof addTagsByNamePublicRequest
>
