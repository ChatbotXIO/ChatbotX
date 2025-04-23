import { z } from "zod"
import { ButtonActionType, buttonBlockSchema } from "../button/schema"

export const templateCatalogSchema = z
  .object({
    showHeader: z.boolean(),
    showFooter: z.boolean(),
    body: z.object({
      text: z.string().min(1).max(1024),
      variables: z.array(z.string().min(1).max(255)),
    }),
    footer: z.string().max(60).nullable(),
    buttons: z.array(buttonBlockSchema).length(1),
  })
  .superRefine((data, ctx) => {
    if (data.showFooter && !data.footer?.length) {
      ctx.addIssue({
        path: ["footer"],
        message: "Footer text is required",
        code: z.ZodIssueCode.custom,
      })
    }
  })

export type TemplateCatalogSchema = z.infer<typeof templateCatalogSchema>

export const templateCatalogDefaultValue = (): TemplateCatalogSchema => ({
  showHeader: false,
  showFooter: false,
  body: {
    text: "",
    variables: [],
  },
  footer: "",
  buttons: [{ text: "View catalog", type: ButtonActionType.QuickReply }],
})
