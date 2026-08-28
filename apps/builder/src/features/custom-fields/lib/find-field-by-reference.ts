import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  FieldReferenceKind,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import type { BotFieldResource } from "@/features/bot-fields/schemas/resource"
import type { CustomFieldResource } from "../schemas/resource"

export type FieldReferenceLookupResult = {
  type: CustomFieldType
}

type FindFieldByReferenceInput = {
  customFields: CustomFieldResource[]
  botFields: BotFieldResource[]
}

/**
 * Resolves a stored field-reference value (`inputFieldId`, `customFieldId`,
 * ...) to its field type, regardless of whether it points at a workspace
 * CustomField or an Account (Bot) Field. Shared by every picker consumer that
 * needs a type-driven hint (temporal hint, operation options) so the
 * bot-field-aware lookup logic lives in exactly one place.
 *
 * - A `bot_field:<id>` token resolves against `botFields` by id.
 * - Everything else resolves against `customFields` by id OR name, matching
 *   `contactCustomFieldService`'s legacy id-or-name lookup behavior.
 */
export function findFieldByReference(
  reference: string | null | undefined,
  { customFields, botFields }: FindFieldByReferenceInput,
): FieldReferenceLookupResult | undefined {
  if (!reference) {
    return
  }

  const parsed = parseFieldReference(reference)

  switch (parsed.kind) {
    case FieldReferenceKind.botField: {
      const field = botFields.find((item) => item.id === parsed.id)
      return field ? { type: field.type as CustomFieldType } : undefined
    }
    case FieldReferenceKind.customField: {
      const field = customFields.find(
        (item) => item.id === parsed.key || item.name === parsed.key,
      )
      return field ? { type: field.type as CustomFieldType } : undefined
    }
    default: {
      const exhaustiveCheck: never = parsed
      return exhaustiveCheck
    }
  }
}
