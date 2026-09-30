import { z } from "zod"

const NUMERIC_PLACEHOLDER_PATTERN = /{{\d+}}/g
const SUPPORTED_PLACEHOLDER_PATTERN = /^{{([1-9]|1[0-5])}}$/

const templateVariableSchema = z.object({
  key: z.string().regex(SUPPORTED_PLACEHOLDER_PATTERN),
  example: z.string().min(1),
})

const templateButtonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("POSTBACK"),
    title: z.string().min(1).max(20),
  }),
  z.object({
    type: z.literal("PHONE_NUMBER"),
    title: z.string().min(1).max(20),
    phoneNumber: z.string().min(1),
  }),
  z.object({
    type: z.literal("URL"),
    title: z.string().min(1).max(20),
    url: z.string().min(1),
    variables: z.array(z.string().min(1)).max(1).default([]),
  }),
])

function extractPlaceholders(text: string): string[] {
  return [...new Set(text.match(NUMERIC_PLACEHOLDER_PATTERN) ?? [])].sort(
    (a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")),
  )
}

function addPlaceholderIssues({
  ctx,
  path,
  text,
  maxVariables,
  variables,
}: {
  ctx: z.RefinementCtx
  path: (string | number)[]
  text: string
  maxVariables: number
  variables: { key: string; example: string }[]
}) {
  const placeholders = extractPlaceholders(text)
  const unsupportedPlaceholder = placeholders.find(
    (placeholder) => !SUPPORTED_PLACEHOLDER_PATTERN.test(placeholder),
  )

  if (unsupportedPlaceholder) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only variables from {{1}} to {{15}} are supported",
      path,
    })
    return
  }

  if (placeholders.length > maxVariables) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Maximum ${maxVariables} variable(s) are supported`,
      path,
    })
    return
  }

  const variableKeys = variables.map((variable) => variable.key)
  const missingExample = placeholders.find((key) => !variableKeys.includes(key))
  const staleExample = variableKeys.find((key) => !placeholders.includes(key))

  if (
    missingExample ||
    staleExample ||
    variableKeys.length !== placeholders.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Variable examples must match the template text",
      path,
    })
  }
}

export const createMessengerMessageTemplateRequest = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/),
    language: z.string().min(1),
    headerType: z.enum(["none", "text", "text_and_image"]),
    headerText: z.string().default(""),
    headerVariables: z.array(templateVariableSchema).max(1).default([]),
    headerImageUrl: z.string().url().optional(),
    body: z.string().min(1),
    bodyVariables: z.array(templateVariableSchema).max(15).default([]),
    buttons: z.array(templateButtonSchema).max(3).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.headerType !== "none" && value.headerText.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Header text is required",
        path: ["headerText"],
      })
    }

    if (value.headerType === "text_and_image" && !value.headerImageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Header image is required",
        path: ["headerImageUrl"],
      })
    }

    if (value.headerType !== "none") {
      addPlaceholderIssues({
        ctx,
        path: ["headerVariables"],
        text: value.headerText,
        maxVariables: 1,
        variables: value.headerVariables,
      })
    }

    addPlaceholderIssues({
      ctx,
      path: ["bodyVariables"],
      text: value.body,
      maxVariables: 15,
      variables: value.bodyVariables,
    })

    value.buttons.forEach((button, index) => {
      if (button.type !== "URL") {
        return
      }

      const placeholders = extractPlaceholders(button.url)
      const unsupportedPlaceholder = placeholders.find(
        (placeholder) => !SUPPORTED_PLACEHOLDER_PATTERN.test(placeholder),
      )

      if (unsupportedPlaceholder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only variables from {{1}} to {{15}} are supported",
          path: ["buttons", index, "url"],
        })
        return
      }

      if (placeholders.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL buttons support only one variable",
          path: ["buttons", index, "url"],
        })
        return
      }

      if (button.variables.length !== placeholders.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL examples must match URL variables",
          path: ["buttons", index, "variables"],
        })
      }
    })
  })

export type CreateMessengerMessageTemplateRequest = z.infer<
  typeof createMessengerMessageTemplateRequest
>
