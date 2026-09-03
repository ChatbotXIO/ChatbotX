import { metaConversionsService } from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { z } from "zod"
import { isZodLikeError } from "./sanitize-capi-error"

type EnqueueEventInput = Parameters<
  typeof metaConversionsService.enqueueEvent
>[0]

type ResolvedCapiFields = {
  value?: string | null
  currency?: string | null
  contentIds?: string | null
}

/**
 * Human-readable summary for the workspace Error Log: zod's per-field
 * message plus the resolved values the templates actually produced, so the
 * user can see *what* the variable turned into rather than only that a
 * field was rejected.
 */
export function describeCapiInputValidationError(
  error: z.ZodError,
  resolved: ResolvedCapiFields = {},
): string {
  const resolvedEntries = Object.entries(resolved).filter(
    ([, fieldValue]) => typeof fieldValue === "string" && fieldValue.length > 0,
  )
  const lines = [z.prettifyError(error)]
  if (resolvedEntries.length > 0) {
    const summary = resolvedEntries
      .map(([field, fieldValue]) => `${field}=${JSON.stringify(fieldValue)}`)
      .join(", ")
    lines.push(`Resolved: ${summary}`)
  }
  return lines.join("\n")
}

/**
 * Surfaces a Meta CAPI configuration/template failure in the workspace
 * Error Log — the same place a Meta-side send failure lands — instead of
 * only in the worker's own logs. Never throws (`logProviderError` swallows).
 */
export async function reportCapiInputFailure(input: {
  workspaceId: string
  contactId?: string | null
  message: string
}): Promise<void> {
  await logProviderError({
    provider: "meta-conversions",
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    error: new Error(input.message),
    httpCode: null,
  })
}

/**
 * Enqueues a CAPI event for the flow-step and trigger-action pipelines. A
 * `{{variable}}` template that resolved to something the business schema
 * rejects (e.g. `value` → "250Hung") is the workspace's configuration
 * problem, so it is recorded in the Error Log before the failure propagates;
 * anything else (DB, queue) stays a platform error and propagates untouched.
 */
export async function enqueueCapiEvent(
  input: EnqueueEventInput,
  context: { contactId: string; resolved: ResolvedCapiFields },
): Promise<void> {
  try {
    await metaConversionsService.enqueueEvent(input)
  } catch (error) {
    if (isZodLikeError(error)) {
      await reportCapiInputFailure({
        workspaceId: input.workspaceId,
        contactId: context.contactId,
        message: describeCapiInputValidationError(error, context.resolved),
      })
    }
    throw error
  }
}
