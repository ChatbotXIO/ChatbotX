import { z } from "zod"

const CUID2_PATTERN = /^[0-9a-z]+$/
const CUID2_MIN_LENGTH = 20
const CUID2_MAX_LENGTH = 30

const normalizeResultCustomFieldId = (val: unknown): string | undefined => {
  if (val === null || val === "" || val === undefined) {
    return
  }
  if (typeof val === "string" && val.trim().length > 0) {
    if (
      CUID2_PATTERN.test(val) &&
      val.length >= CUID2_MIN_LENGTH &&
      val.length <= CUID2_MAX_LENGTH
    ) {
      return val
    }
    return
  }
  return
}

export const baseGenerateTextFieldsSchema = {
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.preprocess(
    normalizeResultCustomFieldId,
    z.string().optional(),
  ),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.boolean().default(true),
  temperature: z.number().min(0).max(2).default(1.0),
  maxTokens: z.number().int().min(250).max(4096).default(250),
} as const

export const baseGenerateTextDefaultValues = {
  prompt: "",
  userMessage: "",
  resultCustomFieldId: undefined,
  tools: [] as string[],
  rememberConversation: true,
  temperature: 1.0,
  maxTokens: 250,
}
