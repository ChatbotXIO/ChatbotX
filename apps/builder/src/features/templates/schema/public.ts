import {
  templateCategories,
  templateCategoryCountsSchema,
  templateInstallationStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListResponse } from "@/lib/public-api/list"
import {
  installTemplateRequest,
  saveTemplateRequest,
  updateShareSettingsRequest,
} from "./mutation"

export const templatePublicResource = z.object({
  id: zodBigintAsString(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  publisherName: z.string().nullable(),
  youtubeVideoId: z.string().nullable(),
  testLink: z.string().nullable(),
  shareEnabled: z.boolean(),
  shareToken: z.string(),
  shareExpiresAt: z.date().nullable(),
  categoryCounts: templateCategoryCountsSchema,
  createInstallFolder: z.boolean(),
  defaultAutoUpdate: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const listTemplatesPublicResponse = publicListResponse(
  templatePublicResource,
)

export const templatePublicRequestParams = z.object({
  id: zodBigintAsString(),
})

const saveTemplatePublicRequest = saveTemplateRequest.omit({
  templateId: true,
})

export const createTemplatePublicRequest = saveTemplatePublicRequest

export const updateTemplatePublicRequest = saveTemplatePublicRequest.extend({
  id: zodBigintAsString(),
})

export const updateTemplateShareSettingsPublicRequest =
  updateShareSettingsRequest
    .omit({ templateId: true })
    .extend({ id: zodBigintAsString() })

export const listSelectableTemplateResourcesPublicRequest = z.object({
  category: templateCategories,
  keyword: z.string().trim().max(255).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const selectableTemplateResourceItem = z.object({
  id: zodBigintAsString(),
  name: z.string(),
  folderName: z.string().optional(),
})

export const listSelectableTemplateResourcesPublicResponse = z.object({
  items: z.array(selectableTemplateResourceItem),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
  allIds: z.array(zodBigintAsString()).optional(),
})

export const templateInstallationPublicResource = z.object({
  id: zodBigintAsString(),
  templateId: zodBigintAsString().nullable(),
  templateName: z.string(),
  status: templateInstallationStatuses,
  warningCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  resourceCount: z.number().int().nonnegative(),
  installFolderId: zodBigintAsString().nullable(),
  autoUpdate: z.boolean(),
  sourceUpdatedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const listTemplateInstallationsPublicResponse = publicListResponse(
  templateInstallationPublicResource,
)

export const installTemplatePublicRequest = installTemplateRequest

export const installTemplatePublicResponse = z.object({
  installationId: zodBigintAsString(),
  status: templateInstallationStatuses,
})

export const updateTemplateInstallationAutoUpdatePublicRequest = z.object({
  id: zodBigintAsString(),
  autoUpdate: z.boolean(),
})
