import type { TemplateModel } from "@chatbotx.io/database/types"
import type { TemplateExport } from "@chatbotx.io/flow-config"

/**
 * Per-category counts of what a parsed payload would install, the shape
 * `categoryCounts` has. The single source: save, install, sync and the worker
 * all authorize against these numbers.
 */
export const categoryCountsOfPayload = (
  payload: TemplateExport,
): TemplateModel["categoryCounts"] => {
  const { resources, manifests } = payload
  return {
    tags: Object.keys(manifests.tags).length,
    customFields: Object.keys(manifests.customFields).length,
    productCategories: Object.keys(manifests.productCategories).length,
    settings:
      resources.settings.savedReplies.length +
      resources.settings.botFields.length,
    flows: resources.flows.length,
    products: resources.products.length,
    aiFunctions: resources.aiFunctions.length,
    aiAgents: resources.aiAgents.length,
    calendars: resources.calendars.length,
    webchats: resources.webchats.length,
    keywords: resources.keywords.length,
    entryPointLinks: resources.entryPointLinks.length,
    triggers: resources.triggers.length,
    fbCommentAutomations: resources.fbCommentAutomations.length,
    sequences: resources.sequences.length,
    aiMcpServers: resources.aiMcpServers.length,
    aiFiles: resources.aiFiles.length,
    questionnaires: resources.questionnaires.length,
    couponTopics: resources.couponTopics.length,
    pipelines: resources.pipelines.length,
  }
}
