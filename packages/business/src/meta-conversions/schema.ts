import {
  metaCapiEventChannelSchema,
  metaCapiEventSourceSchema,
  metaCapiStatusSchema,
} from "@chatbotx.io/database/schema"
import type {
  IntegrationInstagramModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
  MetaCapiEventModel,
} from "@chatbotx.io/database/types"
import { withMetaCapiEventRefinements } from "@chatbotx.io/flow-config"
import {
  defaultMetaCapiActionSource,
  metaCapiActionSourceSchema,
  metaCapiContentTypeSchema,
  metaCapiEventNameSchema,
} from "@chatbotx.io/utils/meta-capi"
import { z } from "zod"
import { splitContentIds } from "./event-input"

const capiDatasetIdSchema = z.string().trim().regex(/^\d+$/)
const capiAccessTokenSchema = z.string().trim().min(1)
// Value must already be canonical `\d+(\.\d+)?` after `trim()` — no
// destructive normalization (no comma/dot stripping: "12,50" is ambiguous
// between 12.50 and 1250). An unresolved `{{...}}` template that leaked past
// the worker's variable resolution is rejected here, not persisted.
const capiEventValueSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Value must be a plain number such as 19.99")
const capiEventCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z]{3}$/,
        "Currency must be a 3-letter ISO 4217 code such as USD",
      ),
  )

/**
 * Business-boundary input for enqueuing a Meta CAPI event, shared by the
 * flow-step handler and the trigger executor — both resolve any
 * `{{variable}}` templates first, then parse the resolved fields here.
 * `eventName`/`actionSource` default the same way the flow-config field
 * schema does, so a caller that omits them still produces today's
 * LeadSubmitted / business_messaging row. The Purchase cross-field rule and
 * the action-source event catalog are the exact same refinements the
 * flow/trigger schemas use — reused, not re-implemented.
 */
export const enqueueEventInput = withMetaCapiEventRefinements(
  z.object({
    workspaceId: z.string().min(1),
    channel: metaCapiEventChannelSchema,
    contactInboxId: z.string().min(1),
    inboxId: z.string().min(1),
    sourceKey: z.string().min(1),
    source: metaCapiEventSourceSchema,
    eventName: metaCapiEventNameSchema.default("LeadSubmitted"),
    actionSource: metaCapiActionSourceSchema.default(
      defaultMetaCapiActionSource,
    ),
    contentType: metaCapiContentTypeSchema.optional(),
    contentIds: z.preprocess(
      splitContentIds,
      z.array(z.string().min(1)).min(1).optional(),
    ),
    value: capiEventValueSchema.optional(),
    currency: capiEventCurrencySchema.optional(),
    contentCategory: z.string().trim().min(1).max(200).optional(),
    contentName: z.string().trim().min(1).max(200).optional(),
    occurredAt: z.date().optional(),
  }),
)

/**
 * `z.input`, not `z.infer`: `eventName`/`actionSource` are `.default()`ed,
 * so under `z.infer` (the *output* type) they would be required — which
 * would break any caller that omits them and relies on this schema's
 * defaults.
 */
export type EnqueueEventInput = z.input<typeof enqueueEventInput>

export type MetaConversionsChannel = EnqueueEventInput["channel"]

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
  /** Preferred token for the create call (e.g. WhatsApp's System User token). */
  accessToken: string
  /**
   * Token to retry the create with when Meta rejects `accessToken` for
   * authorization reasons, or `null`/omitted when the channel has no alternative
   * token. `ensureDatasetId` handles the retry channel-agnostically.
   */
  fallbackAccessToken?: string | null
  resourceId: string
  /**
   * Display name of the underlying Meta resource (page / IG page / WABA name).
   * Callers turn this into the dataset name so a freshly provisioned dataset
   * reads as `"{resourceName} Event Data"` in Events Manager instead of Meta's
   * default "unknown Event Data".
   */
  resourceName: string
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

/**
 * Meta issues codes like `TEST12345`; accept any short token so a future
 * format change on Meta's side does not lock users out. `null` clears it.
 */
export const saveCapiTestEventCodeInput = z.object({
  testEventCode: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .nullable(),
})

export type SaveCapiTestEventCodeInput<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> = {
  channel: TChannel
  integration: MetaConversionsIntegrationByChannel[TChannel]
  testEventCode: string | null
}

export type EnqueueTestEventInput<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> = {
  channel: TChannel
  integration: MetaConversionsIntegrationByChannel[TChannel]
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
