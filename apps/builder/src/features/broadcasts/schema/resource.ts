import {
  broadcastModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type {
  BroadcastModel,
  BroadcastTargetModel,
  FlowModel,
  InboxModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import { z } from "zod"

export const broadcastResource = createSelectSchema(broadcastModel)
export type BroadcastResource = BroadcastModel

/** One page a broadcast sends from, with the page name for display. */
export type BroadcastTargetResource = Pick<
  BroadcastTargetModel,
  "inboxId" | "flowId" | "templateId" | "templateData"
> & {
  inbox: Pick<InboxModel, "id" | "name">
  flow?: Pick<FlowModel, "id" | "name"> | null
}

export type BroadcastResourceWithRelations = BroadcastResource & {
  flow?: Pick<FlowModel, "id" | "name"> | null
  integrationWhatsapp?: Pick<IntegrationWhatsappModel, "id" | "name"> | null
  integrationMessenger?: Pick<IntegrationMessengerModel, "id" | "name"> | null
  targets?: BroadcastTargetResource[]
  contactsCount?: number
}

export const publicBroadcastResource = createSelectSchema(broadcastModel)
  .pick({
    id: true,
    name: true,
    status: true,
    schedulesType: true,
    schedulesAt: true,
    flowId: true,
    contactCount: true,
    audienceRangeStart: true,
    audienceRangeEnd: true,
    sendRatePerMinute: true,
  })
  .extend({
    channel: z.string().optional().describe("Channel the broadcast sends on."),
    subaction: z
      .string()
      .optional()
      .describe("Recipient sub-action, e.g. `whatsappTemplateMessage`."),
    targetMode: z
      .string()
      .optional()
      .describe("`channel` (legacy layout) or `targets` (per-page targets)."),
    templateId: z.string().nullish().describe("Template sent, if any."),
    templateData: z
      .unknown()
      .optional()
      .describe("Template parameters and buttons."),
    contactFilter: z
      .unknown()
      .optional()
      .describe("The contact filter that defines the audience."),
    integrationWhatsappId: z.string().nullish(),
    integrationMessengerId: z.string().nullish(),
    targets: z
      .array(
        z.object({
          inboxId: z.string(),
          flowId: z.string().nullable(),
          templateId: z.string().nullable(),
          templateData: z.unknown().optional(),
          inbox: z.object({ id: z.string(), name: z.string() }).nullish(),
          flow: z.object({ id: z.string(), name: z.string() }).nullish(),
        }),
      )
      .optional()
      .describe("Per-page targets of a multi-page broadcast."),
  })
