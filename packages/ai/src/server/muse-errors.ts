/**
 * Error bodies and status policy shared by the Meta Model API (Muse) clients.
 * Plain zod only — no `node:*` or `Buffer` — so any runtime can import it.
 */
import { z } from "zod"

const museErrorDetailSchema = z.looseObject({
  message: z.string().optional(),
  type: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  param: z.string().nullish(),
})
const museWrappedErrorBodySchema = z.looseObject({
  error: museErrorDetailSchema,
})

type MuseErrorDetail = z.infer<typeof museErrorDetailSchema>

/** Reads `{ error: { … } }` or a bare `{ message, code, … }`. */
export function parseMuseErrorBody(data: unknown): MuseErrorDetail | undefined {
  const wrapped = museWrappedErrorBodySchema.safeParse(data)
  if (wrapped.success) {
    return wrapped.data.error
  }
  return museErrorDetailSchema.safeParse(data).data
}

export function describeMuseErrorBody(data: unknown): string | undefined {
  const detail = parseMuseErrorBody(data)
  if (!detail) {
    return typeof data === "string" && data.trim()
      ? data.trim().slice(0, 300)
      : undefined
  }
  const parts = [
    detail.message,
    detail.type && `type=${detail.type}`,
    detail.code !== undefined && `code=${detail.code}`,
    detail.param && `param=${detail.param}`,
  ].filter((part): part is string => typeof part === "string" && part !== "")
  return parts.length > 0 ? parts.join(", ").slice(0, 300) : undefined
}

const PERMANENT_STATUSES = new Set([400, 401, 403, 406, 413])

/** Only Meta 408/429/5xx are worth a second paid attempt. */
export function isRetryableMuseStatus(status: number): boolean {
  if (PERMANENT_STATUSES.has(status)) {
    return false
  }
  return status === 408 || status === 429 || status >= 500
}
