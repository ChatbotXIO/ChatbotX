import { z } from "zod"
import { buttonBlockDefaultValue, buttonBlockSchema } from "../button/schema"

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
      text: z.string().trim().min(1).max(1024),
      variables: z.array(z.string().min(1).max(255)),
    }),
    footer: z.string().trim().max(60).nullable(),
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

export const templateVideoDefaultValue = (
  countBtn = 0,
): TemplateVideoSchema => ({
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
  buttons: Array.from({ length: countBtn }, (_, index) =>
    buttonBlockDefaultValue(`Button #${index + 1}`),
  ),
})
