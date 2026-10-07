import { z } from "zod"
import { collectInputNames } from "./serialize"
import type { MiniAppDefinition } from "./types"
import {
  collectFileInputNames,
  MINI_APP_MAX_UPLOADS_PER_INPUT,
  MINI_APP_UPLOAD_ID_PATTERN,
} from "./uploads"

export const MINI_APP_MAX_ANSWER_TEXT_LENGTH = 4096
export const MINI_APP_MAX_ANSWERS_BYTES = 64 * 1024

const answerValueSchema = z.union([
  z.string().max(MINI_APP_MAX_ANSWER_TEXT_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(200),
  z.object({
    "start-date": z.string().max(10),
    "end-date": z.string().max(10),
  }),
])

/** What a file input submits: the upload ids returned by the upload route. */
const uploadIdsSchema = z
  .array(z.string().regex(MINI_APP_UPLOAD_ID_PATTERN))
  .min(1)
  .max(MINI_APP_MAX_UPLOADS_PER_INPUT)

/** A file answer once the server has matched its upload ids. */
export interface MiniAppFileAnswer {
  mimeType: string
  name: string
  size: number
  uploadId: string
  url: string
}

export type MiniAppAnswerValue =
  | z.infer<typeof answerValueSchema>
  | MiniAppFileAnswer[]

export const isFileAnswer = (value: unknown): value is MiniAppFileAnswer[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      item && typeof item === "object" && "url" in item && "uploadId" in item,
  )

/** Every input name the Mini App can submit. */
export const collectAnswerNames = (
  definition: MiniAppDefinition,
): Set<string> =>
  new Set(definition.screens.flatMap((screen) => collectInputNames(screen)))

/**
 * Keeps only answers for inputs that exist in the Mini App, with values of an
 * accepted shape. Returns undefined when the payload is not an object or is
 * too large.
 */
export const sanitizeMiniAppAnswers = (
  definition: MiniAppDefinition,
  input: unknown,
): Record<string, MiniAppAnswerValue> | undefined => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return
  }
  if (JSON.stringify(input).length > MINI_APP_MAX_ANSWERS_BYTES) {
    return
  }
  const names = collectAnswerNames(definition)
  const fileNames = collectFileInputNames(definition)
  const answers: Record<string, MiniAppAnswerValue> = {}
  for (const [name, value] of Object.entries(
    input as Record<string, unknown>,
  )) {
    if (!names.has(name)) {
      continue
    }
    // File inputs only accept upload ids; the service swaps them for files.
    const parsed = fileNames.has(name)
      ? uploadIdsSchema.safeParse(value)
      : answerValueSchema.safeParse(value)
    if (parsed.success) {
      answers[name] = parsed.data
    }
  }
  return answers
}
