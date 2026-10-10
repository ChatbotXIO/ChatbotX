import { flowJsonSchema } from "@chatbotx.io/mini-app"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { MINI_APP_NAME_MAX_LENGTH } from "./action"

const miniAppId = zodBigintAsString().describe(
  "Mini App id. Get it from `miniApps.list`.",
)

const flowJsonInput = flowJsonSchema.describe(
  "WhatsApp Flow JSON (Meta's format, e.g. `{ version, screens: [{ id, title, terminal, layout: { type: 'SingleColumnLayout', children: [...] } }] }`). Only endpoint-less Flows are accepted: actions `navigate`, `complete` and `open_url`; `complete` payloads are regenerated from the inputs, so any payload you send is ignored. Exported as Flow JSON version 7.3.",
)

const customFieldMappingsInput = z
  .record(z.string(), zodBigintAsString().nullable())
  .describe(
    "Input `name` → custom field id (get ids from `customFields.list`); `null` removes a mapping. When a contact submits the public link, mapped answers are saved to their custom fields; PhotoPicker/DocumentPicker inputs save their files' public URLs comma-separated and need a shortText/longText field. Names not listed keep their current mapping.",
  )

const miniAppName = z
  .string()
  .trim()
  .min(1)
  .max(MINI_APP_NAME_MAX_LENGTH)
  .describe(
    "Mini App name, unique within the workspace. Also used as the WhatsApp Flow name when published.",
  )

export const miniAppIssuePublicResource = z.object({
  code: z
    .string()
    .describe(
      "Issue code, e.g. `property_too_long`, `navigate_target_missing`.",
    ),
  severity: z
    .enum(["error", "warning"])
    .describe("Errors block publishing to WhatsApp; warnings do not."),
  screenId: z
    .string()
    .optional()
    .describe("Flow JSON screen id the issue is on."),
  path: z
    .string()
    .optional()
    .describe(
      "JSON path of the component, e.g. `screens[0].layout.children[2]`.",
    ),
  property: z
    .string()
    .optional()
    .describe("Component property the issue is about."),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})

export const miniAppValidationPublicResponse = z.object({
  valid: z
    .boolean()
    .describe("True when the Flow has no errors (warnings allowed)."),
  issues: z.array(miniAppIssuePublicResource),
})

const publicationResource = z.object({
  integrationWhatsappId: z
    .string()
    .describe("WhatsApp number (integration) the Flow is published on."),
  status: z
    .string()
    .describe(
      "Meta Flow status: DRAFT, PUBLISHED, DEPRECATED, BLOCKED or THROTTLED.",
    ),
  whatsappFlowId: z
    .string()
    .nullable()
    .describe(
      "Id in `whatsappFlows.list`; use it in a Send WhatsApp Flow step or template button.",
    ),
  publishedAt: z.date().nullable(),
})

export const miniAppSummaryPublicResource = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z
    .boolean()
    .describe("Disabled Mini Apps cannot be opened from their public link."),
  submissionsCount: z
    .number()
    .int()
    .describe("Answers received through the public link."),
  publicUrl: z
    .string()
    .describe(
      "Public link that renders the Mini App on the web, for any channel. Send it from a flow as-is: `{{mini_app_token}}` is filled per contact so answers are attributed; opened elsewhere it works anonymously.",
    ),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const miniAppPublicResource = miniAppSummaryPublicResource.extend({
  flowJson: z
    .record(z.string(), z.unknown())
    .describe("The Mini App as WhatsApp Flow JSON 7.3."),
  customFieldMappings: z
    .record(z.string(), z.string())
    .describe("Input `name` → custom field id its answer is saved to."),
  validation: miniAppValidationPublicResponse,
  publications: z.array(publicationResource),
})

export const listMiniAppsPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring match against the name."),
})

export const listMiniAppsPublicResponse = publicListResponse(
  miniAppSummaryPublicResource,
)

export const createMiniAppPublicRequest = z.object({
  name: miniAppName,
  flowJson: flowJsonInput
    .optional()
    .describe(
      "WhatsApp Flow JSON as in `miniApps.validate`. Omit it to start from a one-screen starter (a heading and a Complete button), like the builder's Create button.",
    ),
  customFieldMappings: customFieldMappingsInput.optional(),
})

export const updateMiniAppPublicRequest = z.object({
  id: miniAppId,
  name: miniAppName.optional(),
  enabled: z.boolean().optional().describe("Whether the public link works."),
  flowJson: flowJsonInput.optional(),
  customFieldMappings: customFieldMappingsInput.optional(),
})

export const miniAppIdPublicRequest = z.object({ id: miniAppId })

export const MINI_APP_BULK_DELETE_MAX_IDS = 100

export const deleteMiniAppsPublicRequest = z.object({
  ids: z
    .array(miniAppId)
    .min(1)
    .max(MINI_APP_BULK_DELETE_MAX_IDS)
    .describe(
      `Ids of the Mini Apps to delete, at most ${MINI_APP_BULK_DELETE_MAX_IDS} per call.`,
    ),
})

export const miniAppFlowJsonPublicResponse = z
  .record(z.string(), z.unknown())
  .describe("WhatsApp Flow JSON 7.3: `{ version, screens: [...] }`.")

export const validateMiniAppPublicRequest = z.object({
  flowJson: flowJsonInput,
})

export const publishMiniAppPublicRequest = z.object({
  id: miniAppId,
  integrationWhatsappId: zodBigintAsString().describe(
    "WhatsApp number to publish to (the WhatsApp channel id). Get it from `whatsappChannels.list`.",
  ),
})

export const listMiniAppSubmissionsPublicRequest = publicListRequest.extend({
  id: miniAppId,
})

export const listMiniAppSubmissionsPublicResponse = publicListResponse(
  z.object({
    id: z.string(),
    contactId: z
      .string()
      .nullable()
      .describe(
        "Contact the answers are attributed to, when the link carried a token.",
      ),
    answers: z
      .record(z.string(), z.unknown())
      .describe(
        "Answers keyed by input `name`. A PhotoPicker/DocumentPicker answer is an array of `{ uploadId, url, name, mimeType, size }`, where `url` is the file's public URL.",
      ),
    createdAt: z.date(),
  }),
)
