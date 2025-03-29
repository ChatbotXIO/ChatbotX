import { z } from "zod"
import { buttonBlockSchema } from "../button/schema"

export const templateImageSchema = z
  .object({
    showHeader: z.boolean(),
    showFooter: z.boolean(),
    header: z.object({
      file: z
        .any()
        .refine(
          (file) =>
            file &&
            file instanceof File &&
            ["image/png", "image/jpg", "image/jpeg"].includes(file.type),
          {
            message: "File must be a Image png, jpg, jpeg",
          },
        )
        .refine((file) => file && file.size <= 2 * 1024 * 1024, {
          message: "File size must not exceed 2MB",
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

export type TemplateImageSchema = z.infer<typeof templateImageSchema>

export const templateImageDefaultValue = (): TemplateImageSchema => ({
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
