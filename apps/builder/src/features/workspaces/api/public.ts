import { resolveTenantSettings, workspaceService } from "@chatbotx.io/business"
import {
  defaultReplyFrequencies,
  isSmartResponseDelayOption,
  SMART_RESPONSE_DELAY_OPTIONS,
} from "@chatbotx.io/database/partials"
import { getPublicFileUrl, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  allCountryCodes,
  allLanguageCodes,
  allTimezoneCodes,
} from "../schema/types"

// A dedicated `settings` scope: the fields below change what the workspace
// says to customers and what it reports to Meta, so they are not part of any
// resource-area scope. Only `scopes: null` tokens get it automatically.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("settings")

const smartResponseDelaySeconds = z
  .number()
  .int()
  .refine(isSmartResponseDelayOption, {
    message: `Must be one of ${SMART_RESPONSE_DELAY_OPTIONS.join(", ")}`,
  })
  .nullable()
  .describe(
    `Seconds the bot waits before replying (${SMART_RESPONSE_DELAY_OPTIONS.join(", ")}), or null for no delay. Shared by every AI agent in the workspace.`,
  )

// Settings → Advanced, checked against the same value lists as the builder
// form. Country and timezone are refined strings rather than enums so the spec
// does not list several hundred values.
const countryCodes = new Set(allCountryCodes)
const timezoneCodes = new Set(allTimezoneCodes)

const targetCountryDescription =
  'ISO 3166-1 alpha-2 code of the country most contacts live in, or "unknown"; the default country for phone numbers without one.'
const languageDescription =
  "Workspace language, one of the builder's locales: the language of text the platform writes for contacts (data-request and date-picker pages, gender and salutation labels), push notifications and import templates."
const timezoneDescription =
  "IANA timezone for contacts whose timezone is unknown, also used by date and time conditions in triggers and webhooks."
const brandColorDescription = "Workspace brand color as `#RRGGBB`."
const developmentModeDescription =
  "The Development Mode switch of Settings → Advanced. It is stored only: the bot does not read it."

const advancedSettingsResourceFields = {
  targetCountry: z
    .string()
    .nullable()
    .describe(`${targetCountryDescription} Null when never set.`),
  language: z.string().describe(languageDescription),
  timezone: z.string().describe(timezoneDescription),
  brandColor: z.string().describe(brandColorDescription),
  developmentMode: z.boolean().describe(developmentModeDescription),
}

const advancedSettingsUpdateFields = {
  targetCountry: z
    .string()
    .refine((value) => countryCodes.has(value), {
      message: 'Must be an ISO 3166-1 alpha-2 country code or "unknown"',
    })
    .optional()
    .describe(targetCountryDescription),
  language: z
    .enum(allLanguageCodes as [string, ...string[]])
    .optional()
    .describe(languageDescription),
  timezone: z
    .string()
    .refine((value) => timezoneCodes.has(value), {
      message: "Must be an IANA timezone such as Asia/Ho_Chi_Minh",
    })
    .optional()
    .describe(timezoneDescription),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .describe(brandColorDescription),
  developmentMode: z.boolean().optional().describe(developmentModeDescription),
}

const workspaceSettingsResource = z.object({
  defaultReply: z
    .string()
    .nullable()
    .describe(
      "Id of the Flow that runs as the Default Reply, or null when none is set. Get flow ids from `flows.list`.",
    ),
  defaultReplyFrequency: defaultReplyFrequencies.describe(
    "How often the Default Reply may fire for the same contact and channel.",
  ),
  smartResponseDelaySeconds,
  capiLimitedDataUse: z
    .boolean()
    .describe("Send Meta Conversions API events with Limited Data Use."),
  logo: z.string().nullable().describe("URL of the workspace logo."),
  ...advancedSettingsResourceFields,
})

const updateWorkspaceSettingsRequest = z.object({
  defaultReply: zodBigintAsString()
    .nullable()
    .optional()
    .describe(
      "Id of the Flow to run as the Default Reply (a flow of this workspace, from `flows.list`; it should be published to reply); null clears it.",
    ),
  defaultReplyFrequency: defaultReplyFrequencies
    .optional()
    .describe("How often the Default Reply may fire for the same contact."),
  smartResponseDelaySeconds: smartResponseDelaySeconds.optional(),
  capiLimitedDataUse: z
    .boolean()
    .optional()
    .describe("Send Meta Conversions API events with Limited Data Use."),
  logo: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .nullable()
    .optional()
    .describe("http(s) URL of the workspace logo; null clears it."),
  ...advancedSettingsUpdateFields,
})

const toResource = (
  storageUrl: string,
  workspace: {
    defaultReply: string | null
    defaultReplyFrequency: z.infer<typeof defaultReplyFrequencies>
    smartResponseDelaySeconds: number | null
    capiLimitedDataUse: boolean
    logo: string | null
    targetCountry: string | null
    language: string
    timezone: string
    brandColor: string
    developmentMode: boolean
  },
) =>
  workspaceSettingsResource.parse({
    defaultReply: workspace.defaultReply,
    defaultReplyFrequency: workspace.defaultReplyFrequency,
    smartResponseDelaySeconds: workspace.smartResponseDelaySeconds,
    capiLimitedDataUse: workspace.capiLimitedDataUse,
    // Uploaded logos are stored as storage paths; the API speaks URLs.
    logo: workspace.logo ? getPublicFileUrl(workspace.logo, storageUrl) : null,
    targetCountry: workspace.targetCountry,
    language: workspace.language,
    timezone: workspace.timezone,
    brandColor: workspace.brandColor,
    developmentMode: workspace.developmentMode,
  })

export const workspaceSettingsPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspace/settings",
      summary: "Get workspace settings",
      description:
        "Returns the workspace settings editable through the API: the Default Reply flow and its frequency, the bot reply delay, Meta Conversions API Limited Data Use, the logo URL, and the Settings → Advanced values (target country, default language and timezone, brand color, development mode). Change them with `workspaceSettings.update`.",
      tags: ["Workspace"],
    })
    .output(workspaceSettingsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context }) =>
      toResource(
        (await resolveTenantSettings({ workspaceId: context.workspace.id }))
          .storageUrl,
        await workspaceService.findById({ id: context.workspace.id }),
      ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/workspace/settings",
      summary: "Update workspace settings",
      description:
        "Changes the Default Reply flow/frequency, the bot reply delay, Conversions API Limited Data Use, the logo, or the Settings → Advanced values (target country, default language and timezone, brand color, development mode). Only the fields you send change. It cannot change the workspace's name, plan, status, owner or members. Read the current values with `workspaceSettings.get` first.",
      tags: ["Workspace"],
    })
    .input(updateWorkspaceSettingsRequest)
    .output(workspaceSettingsResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      toResource(
        (await resolveTenantSettings({ workspaceId: context.workspace.id }))
          .storageUrl,
        await workspaceService.updateSettings({
          id: context.workspace.id,
          data: input,
        }),
      ),
    ),
}
