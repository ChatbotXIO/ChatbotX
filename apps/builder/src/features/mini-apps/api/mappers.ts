import { miniAppService } from "@chatbotx.io/business/mini-app"
import type {
  MiniAppModel,
  MiniAppPublicationModel,
} from "@chatbotx.io/database/types"
import { collectCustomFieldMappings, locateIssues } from "@chatbotx.io/mini-app"
import { buildMiniAppPublicUrl } from "../lib/public-url"

/** Response shapes shared by the public API and the builder actions. */

export const toSummary = (
  miniApp: Pick<
    MiniAppModel,
    "id" | "name" | "enabled" | "submissionsCount" | "createdAt" | "updatedAt"
  >,
) => ({
  id: miniApp.id,
  name: miniApp.name,
  enabled: miniApp.enabled,
  submissionsCount: miniApp.submissionsCount,
  createdAt: miniApp.createdAt,
  updatedAt: miniApp.updatedAt,
  publicUrl: buildMiniAppPublicUrl(miniApp.id),
})

/** Validation issues addressed by Flow JSON screen id and path. */
export const toValidation = (definition: MiniAppModel["definition"]) => {
  const result = miniAppService.validate(definition)
  return {
    valid: result.valid,
    issues: locateIssues(definition, result.issues),
  }
}

export const toPublishResponse = (
  publication: Pick<
    MiniAppPublicationModel,
    "status" | "whatsappFlowId" | "validationErrors"
  > & { published: boolean },
) => ({
  status: publication.status,
  published: publication.published,
  whatsappFlowId: publication.whatsappFlowId,
  validationErrors: publication.validationErrors as unknown[],
})

export const toDetail = (
  miniApp: MiniAppModel & { publications?: MiniAppPublicationModel[] },
) => ({
  ...toSummary(miniApp),
  flowJson: miniApp.flowJson as unknown as Record<string, unknown>,
  customFieldMappings: collectCustomFieldMappings(miniApp.definition),
  validation: toValidation(miniApp.definition),
  publications: (miniApp.publications ?? []).map((publication) => ({
    integrationWhatsappId: publication.integrationWhatsappId,
    status: publication.status,
    whatsappFlowId: publication.whatsappFlowId,
    publishedAt: publication.publishedAt,
  })),
})
