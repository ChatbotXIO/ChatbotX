import {
  metaCapiEventChannelSchema,
  metaCapiEventNameSchema,
  metaCapiEventSourceSchema,
  metaCapiStatusSchema,
} from "@chatbotx.io/database/schema"
import type {
  IntegrationInstagramModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
  MetaCapiEventModel,
} from "@chatbotx.io/database/types"
import { z } from "zod"

const capiDatasetIdSchema = z.string().trim().regex(/^\d+$/)
const capiAccessTokenSchema = z.string().trim().min(1)
const capiEventValueSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/)
const capiEventCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/))

export const enqueueLeadEventInput = z.object({
  workspaceId: z.string().min(1),
  channel: metaCapiEventChannelSchema,
  contactInboxId: z.string().min(1),
  inboxId: z.string().min(1),
  sourceKey: z.string().min(1),
  source: metaCapiEventSourceSchema,
  value: capiEventValueSchema.optional(),
  currency: capiEventCurrencySchema.optional(),
  contentCategory: z.string().trim().min(1).max(200).optional(),
  contentName: z.string().trim().min(1).max(200).optional(),
  occurredAt: z.date().optional(),
})

export type EnqueueLeadEventInput = z.infer<typeof enqueueLeadEventInput>

export type MetaConversionsChannel = EnqueueLeadEventInput["channel"]

/**
 * Channels with a CAPI *connect* UI (custom connection + disconnect).
 * WhatsApp gained a Custom connection + Disconnect flow in v1.7 — the
 * workaround to send WhatsApp CAPI while the embedded-signup `config_id`
 * does not yet grant `whatsapp_business_manage_events` — so it is included
 * here alongside messenger/instagram. Methods narrowed to this type are a
 * compile error to call with a channel outside this set, not a runtime
 * throw.
 */
export type CapiConnectChannel = "messenger" | "instagram" | "whatsapp"

export type MetaConversionsIntegrationByChannel = {
  messenger: IntegrationMessengerModel
  instagram: IntegrationInstagramModel
  whatsapp: IntegrationWhatsappModel
}

export type MetaConversionsIntegration =
  MetaConversionsIntegrationByChannel[MetaConversionsChannel]

export type CapiScopeCheckInput = {
  accessToken: string
  resourceId: string
}

export type DatasetProvisionInput = {
  accessToken: string
  resourceId: string
}

export type DatasetValidationInput = {
  datasetId: string
  accessToken: string
}

export type RefreshCapiScopeCacheInput<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> = {
  channel: TChannel
  integration: MetaConversionsIntegrationByChannel[TChannel]
  checkScope: (input: CapiScopeCheckInput) => Promise<boolean>
  now?: Date
  maxAgeMs?: number
}

export type EnsureDatasetIdInput<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> = {
  channel: TChannel
  integration: MetaConversionsIntegrationByChannel[TChannel]
  provisionDataset: (input: DatasetProvisionInput) => Promise<string>
}

export type SaveDatasetIdInput<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> = {
  channel: TChannel
  integration: MetaConversionsIntegrationByChannel[TChannel]
  datasetId: string
  validate: (input: DatasetValidationInput) => Promise<string>
}

export type ProvisionDatasetNowInput<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> = EnsureDatasetIdInput<TChannel>

export type SaveCapiAccessTokenInput<
  TChannel extends CapiConnectChannel = CapiConnectChannel,
> = {
  channel: TChannel
  integration: MetaConversionsIntegrationByChannel[TChannel]
  accessToken: string
  datasetId: string
  validate: (input: DatasetValidationInput) => Promise<string>
}

export type ClearCapiAccessTokenInput<
  TChannel extends CapiConnectChannel = CapiConnectChannel,
> = {
  channel: TChannel
  integration: MetaConversionsIntegrationByChannel[TChannel]
}

export const saveDatasetIdInput = z.object({
  datasetId: capiDatasetIdSchema,
})

export const saveCapiAccessTokenInput = z.object({
  accessToken: capiAccessTokenSchema,
  datasetId: capiDatasetIdSchema,
})

export const updateCapiStatusInput = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  from: z.literal("pending"),
  to: metaCapiStatusSchema.exclude(["pending"]),
  capiSentAt: z.date().optional(),
  capiError: z.string().nullable().optional(),
})

export type UpdateCapiStatusInput = z.infer<typeof updateCapiStatusInput>

export type FindWorkspaceEventInput = Pick<
  MetaCapiEventModel,
  "id" | "workspaceId"
>

export const metaCapiEventName = metaCapiEventNameSchema.enum.LeadSubmitted
