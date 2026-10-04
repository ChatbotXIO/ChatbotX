import { z } from "zod"

const NUMERIC_PLACEHOLDER_PATTERN = /{{\d+}}/g
const SUPPORTED_PLACEHOLDER_PATTERN = /^{{([1-9]|1[0-5])}}$/

const templateVariableSchema = z.object({
  key: z
    .string()
    .regex(SUPPORTED_PLACEHOLDER_PATTERN)
    .describe("Placeholder as written in the text, e.g. `{{1}}` (1 to 15)."),
  example: z
    .string()
    .min(1)
    .describe("Sample value Meta reviews for this placeholder."),
})

const BUTTON_TITLE = z
  .string()
  .min(1)
  .max(20)
  .describe("Button label, up to 20 characters.")

const templateButtonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z
      .literal("POSTBACK")
      .describe("Button that sends a postback to the bot."),
    title: BUTTON_TITLE,
  }),
  z.object({
    type: z.literal("PHONE_NUMBER").describe("Button that dials a number."),
    title: BUTTON_TITLE,
    phoneNumber: z
      .string()
      .min(1)
      .describe("Number to dial in international format, e.g. `+84901234567`."),
  }),
  z.object({
    type: z.literal("URL").describe("Button that opens a link."),
    title: BUTTON_TITLE,
    url: z
      .string()
      .min(1)
      .describe("Link to open; end it with `{{1}}` to append a variable."),
    variables: z
      .array(z.string().min(1))
      .max(1)
      .default([])
      .describe("Example value for the URL's `{{1}}`, if it has one."),
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
      .regex(/^[a-z0-9_]+$/)
      .describe("Template name: lowercase letters, digits and underscores."),
    language: z
      .string()
      .min(1)
      .describe("Meta language code of the template, e.g. `en_US`, `vi`."),
    headerType: z
      .enum(["none", "text", "text_and_image"])
      .describe(
        "`none`, a `text` header, or `text_and_image` (needs `headerImageUrl`).",
      ),
    headerText: z
      .string()
      .default("")
      .describe("Header text; required unless `headerType` is `none`."),
    headerVariables: z
      .array(templateVariableSchema)
      .max(1)
      .default([])
      .describe("Example for the header's `{{1}}` variable, if it has one."),
    headerImageUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "Public https URL of the header image for `text_and_image`. It must resolve to a public address; redirects are not followed.",
      ),
    body: z
      .string()
      .min(1)
      .describe("Body text; variables are `{{1}}` to `{{15}}`."),
    bodyVariables: z
      .array(templateVariableSchema)
      .max(15)
      .default([])
      .describe("One example per body variable, matching the body text."),
    buttons: z
      .array(templateButtonSchema)
      .max(3)
      .default([])
      .describe("Up to 3 POSTBACK, PHONE_NUMBER or URL buttons."),
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
