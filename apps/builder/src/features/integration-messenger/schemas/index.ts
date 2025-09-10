import z from "zod"

export const facebookPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
})

export const graphFacebookRequestParams = z.tuple([
  z.string().describe("version"),
  z.string().describe("accessToken"),
])
export type GraphFacebookRequestParams = z.infer<
  typeof graphFacebookRequestParams
>

export const selectPageRequestSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
  pageAccessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequestSchema>
