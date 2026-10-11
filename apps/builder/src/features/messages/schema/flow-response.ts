import { z } from "zod"

export const whatsappFlowResponseFileSchema = z.object({
  fileName: z.string().describe("File name as the customer uploaded it."),
  mimeType: z.string().nullable(),
  mediaId: z
    .string()
    .nullable()
    .describe("WhatsApp Cloud API media id; Meta keeps the file temporarily."),
})
export type WhatsappFlowResponseFile = z.infer<
  typeof whatsappFlowResponseFileSchema
>

const fieldBase = {
  key: z.string().describe("The answer's key in the Flow response."),
  label: z
    .string()
    .describe("The question as the Flow labels it, or the humanized key."),
}

export const whatsappFlowResponseFieldSchema = z.discriminatedUnion("kind", [
  z.object({
    ...fieldBase,
    kind: z.literal("text"),
    value: z
      .string()
      .describe("Text, number or date answer; option ids become titles."),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal("list"),
    value: z
      .array(z.string())
      .describe("Multi-select answer; option ids become titles."),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal("boolean"),
    value: z.boolean().describe("Opt-in / checkbox answer."),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal("files"),
    value: z.array(whatsappFlowResponseFileSchema),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal("json"),
    value: z.string().describe("Any other value, as JSON."),
  }),
])
export type WhatsappFlowResponseField = z.infer<
  typeof whatsappFlowResponseFieldSchema
>

export const whatsappFlowResponseSchema = z.object({
  fields: z
    .array(whatsappFlowResponseFieldSchema)
    .describe("Answers in the Flow's question order; `flow_token` excluded."),
  labelSource: z
    .enum(["whatsappFlow", "fallback"])
    .describe(
      "`whatsappFlow`: labels read from the Flow JSON on Meta. `fallback`: the Flow could not be identified or loaded, so labels are humanized keys.",
    ),
})
export type WhatsappFlowResponse = z.infer<typeof whatsappFlowResponseSchema>
