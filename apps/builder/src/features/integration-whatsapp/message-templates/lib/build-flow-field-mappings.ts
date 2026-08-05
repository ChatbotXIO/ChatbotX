import type { WhatsappFlowFieldMapping } from "@chatbotx.io/flow-config"
import type { WhatsappFlowScreenResource } from "@/features/integration-whatsapp/flows/schema/query"

/**
 * Builds the "Save Response to Custom Fields" rows for a WhatsApp Flow launched
 * from a message template's FLOW button.
 *
 * A flow's completion webhook (`nfm_reply.response_json`) returns the data
 * collected across *every* screen the contact went through — not just the
 * template's fixed entry screen (`navigate_screen`). Mapping only the entry
 * screen's `output` therefore misses (often all of) the response fields, since
 * the entry screen frequently collects nothing. We union every screen's `output`
 * and dedupe by `paramKey`, preserving any custom-field the user already picked.
 */
export const buildFlowFieldMappings = (
  screens: WhatsappFlowScreenResource[],
  existingMappings: WhatsappFlowFieldMapping[],
): WhatsappFlowFieldMapping[] => {
  const seenParamKeys = new Set<string>()
  const mappings: WhatsappFlowFieldMapping[] = []

  for (const screen of screens) {
    for (const output of screen.output ?? []) {
      if (seenParamKeys.has(output.value)) {
        continue
      }
      seenParamKeys.add(output.value)

      const existing = existingMappings.find(
        (mapping) => mapping.paramKey === output.value,
      )
      mappings.push({
        paramKey: output.value,
        paramLabel: output.label,
        customFieldId: existing?.customFieldId ?? null,
      })
    }
  }

  return mappings
}
