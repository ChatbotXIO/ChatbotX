import {
  broadcastModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type {
  BroadcastModel,
  BroadcastRecurrenceModel,
  BroadcastTargetModel,
  FlowModel,
  InboxModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import { recurrenceRuleShape } from "@chatbotx.io/utils/recurrence"
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

/** What the list and detail carry about a repeating broadcast's schedule. */
type BroadcastRecurrenceSummary = Pick<
  BroadcastRecurrenceModel,
  | "id"
  | "rule"
  | "nextRunAt"
  | "occurrenceCount"
  | "lastOccurrenceAt"
  | "pausedAt"
  | "endedAt"
> & {
  /** The next run that will really send; differs from `nextRunAt` when that slot's date is skipped. */
  nextSendAt: Date | null
  upcomingRuns?: string[]
}

export type BroadcastResourceWithRelations = BroadcastResource & {
  recurrence?: BroadcastRecurrenceSummary | null
  parent?: Pick<BroadcastModel, "id" | "name"> | null
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
    parentBroadcastId: z
      .string()
      .nullish()
      .describe(
        "For a run: the id of the repeating broadcast that created it.",
      ),
    occurrenceAt: z
      .date()
      .nullish()
      .describe("For a run: the scheduled slot it was created for."),
    recurrence: z
      .object({
        id: z.string(),
        rule: recurrenceRuleShape,
        nextRunAt: z
          .date()
          .nullable()
          .describe(
            "The series' next slot; null while the series is paused or over. It may fall on a skipped date — use `nextSendAt` for the next run that will really send.",
          ),
        nextSendAt: z
          .date()
          .nullable()
          .describe(
            "The next run that will really send, after skipping `rule.excludeDates`; null when paused, over, or only skipped dates remain.",
          ),
        occurrenceCount: z.number().int().describe("Runs created so far."),
        lastOccurrenceAt: z.date().nullable(),
        pausedAt: z.date().nullable(),
        endedAt: z.date().nullable(),
        upcomingRuns: z
          .array(z.string())
          .optional()
          .describe("ISO 8601 times of the next runs (detail only)."),
      })
      .nullish()
      .describe(
        "The repeat schedule, present only when `schedulesType` is `recurring`.",
      ),
    parent: z
      .object({ id: z.string(), name: z.string() })
      .nullish()
      .describe("For a run: the repeating broadcast that created it."),
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
