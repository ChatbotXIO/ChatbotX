import {
  DEFAULT_WHATSAPP_FLOW_FILE_FORMAT,
  type WhatsappFlowFieldMapping,
} from "@chatbotx.io/flow-config"
import type {
  WhatsappFlowScreenOutputResource,
  WhatsappFlowScreenResource,
} from "@/features/integration-whatsapp/flows/schema/query"

/**
 * The mapping row of one Flow answer, keeping what the user already chose for
 * it (its custom field and, for a file answer, how the files are written).
 */
const toFieldMapping = (
  output: WhatsappFlowScreenOutputResource,
  existing: WhatsappFlowFieldMapping | undefined,
): WhatsappFlowFieldMapping => ({
  paramKey: output.value,
  paramLabel: output.label,
  customFieldId: existing?.customFieldId ?? null,
  ...(output.kind === "file"
    ? {
        fileFormat: existing?.fileFormat ?? DEFAULT_WHATSAPP_FLOW_FILE_FORMAT,
      }
    : {}),
})

/**
 * The mapping rows of a Flow's answers, in their order. Shared by every place
 * that rebuilds mappings from a Flow's screens.
 */
export const toFieldMappings = (
  outputs: WhatsappFlowScreenOutputResource[],
  existingMappings: WhatsappFlowFieldMapping[],
): WhatsappFlowFieldMapping[] =>
  outputs.map((output) =>
    toFieldMapping(
      output,
      existingMappings.find((mapping) => mapping.paramKey === output.value),
    ),
  )

/**
 * Every key a WhatsApp Flow can return, once per key: the keys of each
 * screen's `complete` payload, unioned, since a template can open the Flow
 * on one screen and complete it on another. The first label wins; a key that
 * any screen fills with uploaded files is a file answer, so its format survives.
 */
export const collectFlowOutputs = (
  screens: WhatsappFlowScreenResource[],
): WhatsappFlowScreenOutputResource[] => {
  const byKey = new Map<string, WhatsappFlowScreenOutputResource>()
  for (const output of screens.flatMap((screen) => screen.output ?? [])) {
    const known = byKey.get(output.value)
    byKey.set(
      output.value,
      known
        ? { ...known, kind: known.kind === "file" ? "file" : output.kind }
        : output,
    )
  }
  return [...byKey.values()]
}

/**
 * Builds the "Save Response to Custom Fields" rows for a WhatsApp Flow launched
 * from a message template's FLOW button, keeping any custom field (and file
 * format) the user already picked.
 */
export const buildFlowFieldMappings = (
  screens: WhatsappFlowScreenResource[],
  existingMappings: WhatsappFlowFieldMapping[],
): WhatsappFlowFieldMapping[] =>
  toFieldMappings(collectFlowOutputs(screens), existingMappings)
