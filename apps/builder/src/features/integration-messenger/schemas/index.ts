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
  accessToken: z.string(),
})
export type SelectPageRequest = z.infer<typeof selectPageRequestSchema>

export const listPagesResponseSchema = z.object({
  data: z.array(facebookPageSchema),
  paging: z
    .object({
      cursors: z
        .object({
          before: z.string().optional(),
          after: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
})

const selectPageSchema = z.object({
  pageId: z.string().min(1, "Please select a Facebook page"),
})

export type SelectPageForm = z.infer<typeof selectPageSchema>
