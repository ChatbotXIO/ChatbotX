import { resolveTenantSettings, workspaceService } from "@chatbotx.io/business"
import {
  defaultReplyFrequencies,
  isSmartResponseDelayOption,
  SMART_RESPONSE_DELAY_OPTIONS,
} from "@chatbotx.io/database/partials"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

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

const workspaceSettingsResource = z.object({
  defaultReply: z
    .string()
    .nullable()
    .describe("Text of the Default Reply flow trigger, if any."),
  defaultReplyFrequency: defaultReplyFrequencies.describe(
    "How often the Default Reply may fire for the same contact and channel.",
  ),
  smartResponseDelaySeconds,
  capiLimitedDataUse: z
    .boolean()
    .describe("Send Meta Conversions API events with Limited Data Use."),
  logo: z.string().nullable().describe("URL of the workspace logo."),
})

const updateWorkspaceSettingsRequest = z.object({
  defaultReply: z
    .string()
    .max(4000)
    .nullable()
    .optional()
    .describe("Default Reply text; null clears it."),
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
})

const toResource = (
  storageUrl: string,
  workspace: {
    defaultReply: string | null
    defaultReplyFrequency: z.infer<typeof defaultReplyFrequencies>
    smartResponseDelaySeconds: number | null
    capiLimitedDataUse: boolean
    logo: string | null
  },
) =>
  workspaceSettingsResource.parse({
    defaultReply: workspace.defaultReply,
    defaultReplyFrequency: workspace.defaultReplyFrequency,
    smartResponseDelaySeconds: workspace.smartResponseDelaySeconds,
    capiLimitedDataUse: workspace.capiLimitedDataUse,
    // Uploaded logos are stored as storage paths; the API speaks URLs.
    logo: workspace.logo ? getPublicFileUrl(workspace.logo, storageUrl) : null,
  })

export const workspaceSettingsPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspace/settings",
      summary: "Get workspace settings",
      description:
        "Returns the workspace settings editable through the API: Default Reply text and frequency, the bot reply delay, Meta Conversions API Limited Data Use, and the logo URL. Change them with `workspaceSettings.update`.",
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
        "Changes the Default Reply text/frequency, the bot reply delay, Conversions API Limited Data Use or the logo. Only the fields you send change. It cannot change the workspace's name, plan, status, owner or members.",
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
