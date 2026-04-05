import { z } from "zod"
import { buttonActionTypes, buttonStepSchema } from "../button/schema"

export const templateProductSchema = z
  .object({
    hideHeader: z.boolean(),
    showFooter: z.boolean(),
    header: z.object({
      text: z.string().max(60),
      variables: z.array(z.string().min(1).max(255)).max(1),
    }),
    body: z.object({
      text: z.string().trim().min(1).max(1024),
      variables: z.array(z.string().min(1).max(255)),
    }),
    footer: z.string().trim().max(60).nullable(),
    buttons: z.array(buttonStepSchema).max(3),
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

export type TemplateProductSchema = z.infer<typeof templateProductSchema>

export const templateProductDefaultValue = (): TemplateProductSchema => ({
  hideHeader: true,
  showFooter: false,
  header: {
    text: "",
    variables: [],
  },
  body: {
    text: "",
    variables: [],
  },
  footer: "",
  buttons: [{ type: buttonActionTypes.enum.quickReply, text: "View Items" }],
})
