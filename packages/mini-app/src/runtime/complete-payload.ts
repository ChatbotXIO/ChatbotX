import {
  extractReferences,
  type MiniAppRuntimeScope,
  resolveReference,
} from "../expression"
import { buildCompletePayload } from "../serialize"
import type { MiniAppDefinition } from "../types"

/**
 * What a `complete` on `screenKey` sends: the `buildCompletePayload` bindings
 * resolved against the answers so far. Unanswered inputs are left out.
 */
export const resolveCompletePayload = (
  definition: MiniAppDefinition,
  screenKey: string,
  scope: MiniAppRuntimeScope,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {}
  for (const [name, binding] of Object.entries(
    buildCompletePayload(definition, screenKey),
  )) {
    const reference = extractReferences(binding)[0]?.reference
    const value = reference ? resolveReference(reference, scope) : undefined
    if (value !== undefined) {
      payload[name] = value
    }
  }
  return payload
}
