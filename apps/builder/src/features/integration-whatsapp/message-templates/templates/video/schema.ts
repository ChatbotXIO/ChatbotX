import { z } from "zod"
import { buttonBlockSchema } from "../button/schema"

export const templateVideoSchema = z
  .object({
    showHeader: z.boolean(),
    showFooter: z.boolean(),
    header: z.object({
      file: z
        .any()
        .refine(
          (file) => file && file instanceof File && file.type === "video/mp4",
          {
            message: "File must be a Video",
          },
        )
        .refine((file) => file && file.size <= 20 * 1024 * 1024, {
          message: "File size must not exceed 20MB",
        }),
    }),
    body: z.object({
      text: z.string().min(1).max(1024),
      variables: z.array(z.string().min(1).max(255)),
    }),
    footer: z.string().max(60).nullable(),
    buttons: z.array(buttonBlockSchema).max(3),
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

export type TemplateVideoSchema = z.infer<typeof templateVideoSchema>

export const templateVideoDefaultValue = (): TemplateVideoSchema => ({
  showHeader: true,
  showFooter: false,
  header: {
    file: null,
  },
  body: {
    text: "",
    variables: [],
  },
  footer: "",
  buttons: [],
})
