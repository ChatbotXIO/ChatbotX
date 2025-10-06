import z from "zod"

export const selectPageRequest = z.object({
  pageId: z.string(),
  pageName: z.string(),
  accessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequest>
