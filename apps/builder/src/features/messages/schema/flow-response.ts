import { flowResponseFileFailureReasons } from "@chatbotx.io/sdk"
import { z } from "zod"

const fileNameSchema = z
  .string()
  .describe("File name as the customer uploaded it.")

/**
 * A file the customer attached to an answer. `stored`: kept, `url` opens it.
 * `failed`: could not be kept, `failureReason` says why. `unprocessed`: only
 * the provider's description of it exists (a response received before files
 * were kept, or a kept file whose copy is gone); `mediaId` is the provider's
 * reference, which the provider may not keep.
 */
export const whatsappFlowResponseFileSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("stored"),
    fileName: fileNameSchema,
    mimeType: z.string(),
    mediaId: z.string().describe("The provider's media id."),
    size: z.number().int().nonnegative().describe("Size in bytes."),
    url: z
      .string()
      .describe("Link to the stored file; short-lived for private storage."),
  }),
  z.object({
    status: z.literal("failed"),
    fileName: fileNameSchema,
    mimeType: z.string().nullable(),
    mediaId: z.string().describe("The provider's media id."),
    failureReason: z
      .enum(flowResponseFileFailureReasons)
      .describe(
        "`too_large`, `unsupported_type`: rejected. `download_failed`: could not be fetched from the provider.",
      ),
  }),
  z
    .object({
      status: z.literal("unprocessed"),
      fileName: fileNameSchema,
      mimeType: z.string().nullable(),
      mediaId: z
        .string()
        .nullable()
        .describe(
          "The provider's media id; the provider keeps it temporarily.",
        ),
    })
    .describe(
      "No stored copy to open: a response received before files were kept, or a kept file whose stored copy is gone. Nothing more will arrive for it.",
    ),
])
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
