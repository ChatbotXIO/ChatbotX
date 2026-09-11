import {
  broadcastScheduleTypes,
  broadcastSendsFlow,
  broadcastSendsTemplate,
  broadcastSubactions,
  channelTypes,
  hasDuplicateBroadcastTarget,
  hasFlowAndTemplate,
  isTargetsFlowSendWithoutFlow,
  isTargetsTemplateSendWithoutTemplate,
  isTemplateSendWithoutPage,
} from "@chatbotx.io/database/partials"
import {
  messengerTemplateParamsSchema,
  validateWaTemplateSendParams,
  type WaTemplateParams,
  waTemplateParamsSchema,
} from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { startOfMinute } from "date-fns"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contact-filter/schema"

// Both `createBroadcastRequest.schedulesAt` and `scheduleBroadcastSchema`
// validate against the NORMALISED (minute-truncated) time, because that is
// what actually gets persisted (`startOfMinute(new Date(value))`). Validating
// against the raw, un-truncated value would let e.g. 12:00:30 pass at
// 12:00:00 and then be stored as 12:00:00 — already-eligible, not future.
export const normalizeScheduleTime = (value: string): Date =>
  startOfMinute(new Date(value))

const isFutureScheduleTime = (value: string): boolean => {
  const date = normalizeScheduleTime(value)
  return !Number.isNaN(date.getTime()) && date > new Date()
}

const FUTURE_SCHEDULE_MESSAGE = "Schedules must be after now."

/** Template params as stored/sent for either template-capable channel. */
export const broadcastTemplateDataSchema = z.union([
  waTemplateParamsSchema,
  messengerTemplateParamsSchema,
])

/** Flow bindings for a Messenger template's buttons. */
export const broadcastTemplateButtonsSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    flowId: z.string().optional(),
  }),
)

/**
 * One page a broadcast sends from, with the template (and params) chosen for
 * that page. A flow broadcast leaves `templateId` unset.
 */
export const broadcastTargetSchema = z.object({
  inboxId: zodBigintAsString(),
  flowId: zodBigintAsString().optional(),
  templateId: zodBigintAsString().optional(),
  templateData: broadcastTemplateDataSchema.optional(),
  buttons: broadcastTemplateButtonsSchema.optional(),
})
export type BroadcastTargetRequest = z.infer<typeof broadcastTargetSchema>

export const createBroadcastRequest = z
  .object({
    channel: channelTypes,
    flowId: zodBigintAsString().optional(),
    templateId: zodBigintAsString().optional(),
    integrationWhatsappId: zodBigintAsString().optional(),
    integrationMessengerId: zodBigintAsString().optional(),
    templateData: broadcastTemplateDataSchema.optional(),
    buttons: broadcastTemplateButtonsSchema.optional(),
    targets: z.array(broadcastTargetSchema).optional(),
    /** The page multi-select's value; `targets` mirrors it and is what the server reads. */
    inboxIds: z.array(zodBigintAsString()).optional(),
    subaction: broadcastSubactions,
    schedulesType: broadcastScheduleTypes,
    // Future-ness is validated by the `superRefine` below, not here: that
    // check has the full object (`schedulesType`, `saveAsDraft`) and is the
    // only one that can tell a schedule actually being set (validate) from
    // a draft merely carrying a stale or not-yet-chosen date (don't). A
    // field-level `.refine` here ran unconditionally on any non-null value,
    // so it blocked re-saving an untouched `future` draft once its
    // previously-chosen `schedulesAt` elapsed.
    schedulesAt: z.string().nullable(),
    contactFilter: contactFilterRequest.shape.contactFilter,
    saveAsDraft: z.boolean().optional(),
  })
  .refine(
    (data) => !!(broadcastSendsFlow(data) || broadcastSendsTemplate(data)),
    {
      message: "Either flow or template must be selected",
      path: ["flowId"],
    },
  )
  .refine((data) => !hasFlowAndTemplate(data), {
    message: "A broadcast sends either a flow or a template, not both",
    path: ["flowId"],
  })
  .refine((data) => !isTargetsTemplateSendWithoutTemplate(data), {
    message: "Select a template for at least one page",
    path: ["targets"],
  })
  .refine((data) => !isTargetsFlowSendWithoutFlow(data), {
    message: "Select a flow for at least one page",
    path: ["targets"],
  })
  .refine((data) => !hasDuplicateBroadcastTarget(data), {
    message: "A page can only be selected once",
    path: ["targets"],
  })
  .refine((data) => !isTemplateSendWithoutPage(data), {
    message: "Select the page the template belongs to",
    path: ["inboxIds"],
  })
  // A `future` schedule that is actually being scheduled (`saveAsDraft` is
  // false/undefined) must carry the time it is scheduled for. Without this,
  // `create`/`updateDraft` fall back to `startOfMinute(new Date())` and
  // persist `schedulesType: "future"` alongside an already-elapsed
  // `schedulesAt` — an internally inconsistent row that `enqueueBroadcast`
  // then picks up on its next tick, i.e. a silent send-now. Mirrors the
  // equivalent check in `scheduleBroadcastSchema` below.
  //
  // `saveAsDraft: true` is exempt: a draft is never picked up by
  // `enqueueBroadcast` (it only scans `status = scheduled`), so a draft
  // saved with `schedulesType: "future"` and no date yet chosen — or one
  // whose previously-chosen date has since elapsed while it sat unsent — is
  // harmless and must remain saveable. Without this exemption, reopening and
  // re-saving such a draft (with no schedule-related edit at all) fails
  // validation until the user re-picks a future date.
  .superRefine((data, ctx) => {
    if (
      !data.saveAsDraft &&
      data.schedulesType === "future" &&
      !(data.schedulesAt && isFutureScheduleTime(data.schedulesAt))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["schedulesAt"],
        message: FUTURE_SCHEDULE_MESSAGE,
      })
    }
  })
  // Send-blocking WhatsApp template rules (MPM sections, LTO expiration):
  // the flow editor enforces them at publish, this refinement covers the
  // broadcast surface with the same shared rule set — once for the legacy
  // single template and once per page of a multi-page broadcast.
  .superRefine((data, ctx) => {
    if (data.channel !== channelTypes.enum.whatsapp) {
      return
    }
    if (data.templateData) {
      validateWaTemplateSendParams(data.templateData as WaTemplateParams, ctx, [
        "templateData",
      ])
    }
    for (const [index, target] of (data.targets ?? []).entries()) {
      if (target.templateData) {
        validateWaTemplateSendParams(
          target.templateData as WaTemplateParams,
          ctx,
          ["targets", index, "templateData"],
        )
      }
    }
  })
export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequest>

export const updateBroadcastSchema = z.object({
  name: z.string().trim().min(1).max(255),
})
export type UpdateBroadcastSchema = z.infer<typeof updateBroadcastSchema>

export const scheduleBroadcastSchema = z
  .object({
    schedulesType: broadcastScheduleTypes,
    schedulesAt: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.schedulesType === "future" &&
      !(data.schedulesAt && isFutureScheduleTime(data.schedulesAt))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["schedulesAt"],
        message: FUTURE_SCHEDULE_MESSAGE,
      })
    }
  })
export type ScheduleBroadcastSchema = z.infer<typeof scheduleBroadcastSchema>

// A `now` draft gets `schedulesAt = startOfMinute(now) <= now`, so
// `enqueueBroadcast`'s `schedulesAt <= startTime AND status = scheduled` scan
// picks it up on its next minute tick — the same path a "send now" create takes.
// Shared by `scheduleBroadcastAction` and the public API's `schedule` route.
export const resolveScheduleTime = (
  parsedInput: ScheduleBroadcastSchema,
): Date =>
  normalizeScheduleTime(
    parsedInput.schedulesType === "future" && parsedInput.schedulesAt
      ? parsedInput.schedulesAt
      : new Date().toISOString(),
  )
