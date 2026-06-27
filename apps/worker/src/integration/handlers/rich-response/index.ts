import { jsonrepair } from "jsonrepair"
import { z } from "zod"
import {
  MAX_BUTTON_LABEL_LENGTH,
  MAX_GENERIC_ELEMENT_TEXT_LENGTH,
} from "./constants"

const MARKDOWN_JSON_FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i

const delaySecondsSchema = z.number().int().min(0).max(30)

export const richActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_tag"),
    tag_name: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal("remove_tag"),
    tag_name: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal("set_field_value"),
    field_name: z.string().trim().min(1).max(100),
    value: z.string().max(5000),
  }),
  z.object({
    action: z.literal("unset_field_value"),
    field_name: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal("send_flow"),
    flow_id: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("transfer_conversation_to"),
    value: z.literal("human"),
  }),
  z.object({
    action: z.literal("assign_conversation"),
    admin_id: z.string().trim().min(1),
  }),
  z.object({ action: z.literal("unassign_conversation") }),
])

const buttonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.slice(0, MAX_BUTTON_LABEL_LENGTH)),
  type: z.enum(["web_url", "postback", "phone_number"]),
  url: z.url().optional(),
  payload: z.string().optional(),
})

const quickReplySchema = z.object({
  content_type: z.literal("text"),
  title: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.slice(0, MAX_BUTTON_LABEL_LENGTH)),
  payload: z.string().optional(),
})

const mediaAttachmentSchema = z.object({
  type: z.enum(["image", "video", "audio", "file"]),
  payload: z.object({ url: z.url() }),
})

const buttonTemplateSchema = z.object({
  // AI reasoning models sometimes emit "button" instead of "template" — normalise both
  type: z.enum(["template", "button"]).transform(() => "template" as const),
  payload: z.object({
    template_type: z.literal("button"),
    text: z.string().trim().min(1).max(1000),
    buttons: z.array(buttonSchema).max(3).default([]),
  }),
})

const genericTemplateSchema = z.object({
  type: z.literal("template"),
  payload: z.object({
    template_type: z.literal("generic"),
    image_aspect_ratio: z.enum(["horizontal", "square"]).optional(),
    elements: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(MAX_GENERIC_ELEMENT_TEXT_LENGTH),
          subtitle: z
            .string()
            .trim()
            .max(MAX_GENERIC_ELEMENT_TEXT_LENGTH)
            .optional(),
          image_url: z.url().optional(),
          buttons: z.array(buttonSchema).max(3).default([]),
        }),
      )
      .min(1)
      .max(10),
  }),
})

export const richMessengerMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(1000).optional(),
    quick_replies: z.array(quickReplySchema).max(10).optional(),
    attachment: z
      .union([
        mediaAttachmentSchema,
        buttonTemplateSchema,
        genericTemplateSchema,
      ])
      .optional(),
  })
  .refine(
    (msg) =>
      msg.text != null || msg.quick_replies != null || msg.attachment != null,
    {
      message:
        "Message must have at least one of: text, quick_replies, attachment",
    },
  )

const richMessageSchema = z.union([
  delaySecondsSchema,
  // Auto-correct: weaker models sometimes place "quick_replies" beside "message" instead of inside it
  z
    .object({
      message: z.object({}).passthrough(),
      quick_replies: z.array(quickReplySchema).max(10),
    })
    .transform(({ message, quick_replies }) => ({
      message: richMessengerMessageSchema.parse({ ...message, quick_replies }),
    })),
  z.object({ message: richMessengerMessageSchema }),
  z.object({ messaging_product: z.literal("whatsapp") }).passthrough(),
  // AI reasoning models sometimes omit the "message" wrapper and output {"attachment":{...}} or
  // {"text":"..."} directly — normalise these to {"message":{...}}
  richMessengerMessageSchema.transform((v) => ({ message: v })),
])

export type RichResponseContext = {
  workspaceId: string
  conversationId: string
  contactId: string
  contactInboxId: string
  channel?: string
  executionId: string
  flowContextId: string
  flowVersionId?: string
}

export const richResponseSchema = z
  .object({
    messages: z.array(richMessageSchema).default([]),
    actions: z.array(richActionSchema).default([]),
  })
  .refine((value) => value.messages.length > 0 || value.actions.length > 0, {
    message: "Rich response must contain messages or actions",
  })

export type RichAction = z.infer<typeof richActionSchema>
export type RichMessengerMessage = z.infer<typeof richMessengerMessageSchema>
export type RichResponseItem = z.infer<typeof richMessageSchema>
export type ParsedRichResponse = z.infer<typeof richResponseSchema>

export type RichResponseParseResult =
  | { ok: true; data: ParsedRichResponse }
  | { ok: false; reason: "plain_text"; text: string }
  | { ok: false; reason: "invalid_json" | "schema_error"; text: string }

export function parseRichResponse(text: string): RichResponseParseResult {
  const stripped = stripMarkdownJsonFence(text.trim())
  if (!stripped) {
    return { ok: false, reason: "invalid_json", text }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const jsonPrefix = extractJsonPrefix(stripped)
    if (jsonPrefix) {
      try {
        parsed = JSON.parse(jsonPrefix)
      } catch {
        return { ok: false, reason: "invalid_json", text }
      }
    } else {
      if (looksLikePlainText(stripped)) {
        return { ok: false, reason: "plain_text", text }
      }
      // Last resort: repair common JSON issues (extra/mismatched braces, trailing commas, etc.)
      try {
        parsed = JSON.parse(jsonrepair(stripped))
      } catch {
        return { ok: false, reason: "invalid_json", text }
      }
    }
  }

  const result = richResponseSchema.safeParse(parsed)
  if (!result.success) {
    return { ok: false, reason: "schema_error", text }
  }

  return { ok: true, data: result.data }
}

function stripMarkdownJsonFence(text: string): string {
  const fenceMatch = text.match(MARKDOWN_JSON_FENCE_RE)
  return fenceMatch?.[1]?.trim() ?? text
}

function looksLikePlainText(text: string): boolean {
  const trimmed = text.trim()
  const first = trimmed.at(0)
  if (!first || first === "{" || first === "[") {
    return false
  }
  // Text containing brace/bracket structures is likely broken JSON wrapped in prose —
  // treat as invalid_json to avoid sending garbled content to the user.
  const containsJsonStructure = trimmed.includes("{") || trimmed.includes("[")
  return !containsJsonStructure
}

function extractJsonPrefix(text: string): string | undefined {
  const trimmed = text.trimStart()
  const opener = trimmed.at(0)
  if (opener !== "{" && opener !== "[") {
    return
  }

  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]")
      continue
    }

    if (char === "}" || char === "]") {
      if (stack.pop() !== char) {
        return
      }

      if (stack.length === 0) {
        return trimmed.slice(0, index + 1)
      }
    }
  }
}
