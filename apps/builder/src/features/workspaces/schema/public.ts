import {
  workspaceApiTokenPermissions,
  workspaceApiTokenScopes,
} from "@chatbotx.io/database/partials"
import type { WorkspaceApiTokenModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceResource } from "./resource"
import {
  toggleSupportAccessRequest,
  updateSmartResponseDelayRequest,
  updateWorkspaceAdvancedRequest,
  updateWorkspaceBasicRequest,
  updateWorkspaceStatusRequest,
} from "./update-workspace-schema"
import { toWorkspaceApiTokenDto } from "./workspace-token-dto"

export const workspacePublicResource = workspaceResource.pick({
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  defaultReply: true,
  defaultReplyFrequency: true,
  targetCountry: true,
  language: true,
  timezone: true,
  brandColor: true,
  developmentMode: true,
  smartResponseDelaySeconds: true,
  isActive: true,
  startTime: true,
  endTime: true,
  logo: true,
  scheduledDeletionAt: true,
  supportAccessUntil: true,
  capiLimitedDataUse: true,
})

export const updateWorkspacePublicRequest = updateWorkspaceBasicRequest
  .merge(updateWorkspaceAdvancedRequest)
  .merge(updateSmartResponseDelayRequest)
  .partial()

export const updateWorkspaceStatusPublicRequest = updateWorkspaceStatusRequest

export const updateWorkspaceSupportAccessPublicRequest =
  toggleSupportAccessRequest

export const refreshChannelTokensPublicResponse = z.object({
  refreshed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export const workspaceApiTokenPublicResource = z.object({
  id: zodBigintAsString(),
  name: z.string(),
  permission: workspaceApiTokenPermissions,
  tokenPrefix: z.string().nullable(),
  isDefault: z.boolean(),
  scopes: z.array(workspaceApiTokenScopes).nullable(),
  createdAt: workspaceResource.shape.createdAt,
})

export const toPublicWorkspaceApiToken = (token: WorkspaceApiTokenModel) => ({
  ...toWorkspaceApiTokenDto(token),
  permission: workspaceApiTokenPermissions.parse(token.permission),
})

export const createWorkspaceApiTokenPublicRequest = z.object({
  name: z.string().min(1).max(100),
  permission: workspaceApiTokenPermissions,
  scopes: z.array(workspaceApiTokenScopes).min(1).nullable(),
})

export const getWorkspaceApiTokenPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const updateWorkspaceApiTokenPublicRequest =
  createWorkspaceApiTokenPublicRequest.partial().extend({
    id: zodBigintAsString(),
  })

export const createWorkspaceApiTokenPublicResponse = z.object({
  apiToken: workspaceApiTokenPublicResource,
  token: z
    .string()
    .describe(
      "Plaintext token. Returned only in this response — only a SHA-256 hash is stored.",
    ),
})
