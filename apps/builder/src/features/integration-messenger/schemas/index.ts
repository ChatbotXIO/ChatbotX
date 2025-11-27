import z from "zod"

export const selectPageRequest = z.object({
  chatbotId: z.string().nullish(),
  pageId: z.string(),
  pageName: z.string(),
  accessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequest>
