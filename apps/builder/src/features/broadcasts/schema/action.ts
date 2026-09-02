import {
  broadcastScheduleTypes,
  broadcastSubactions,
  channelTypes,
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

export const createBroadcastRequest = z
  .object({
    channel: channelTypes,
    flowId: zodBigintAsString().optional(),
    templateId: zodBigintAsString().optional(),
    integrationWhatsappId: zodBigintAsString().optional(),
    integrationMessengerId: zodBigintAsString().optional(),
    templateData: broadcastTemplateDataSchema.optional(),
    buttons: broadcastTemplateButtonsSchema.optional(),
    subaction: broadcastSubactions,
    schedulesType: broadcastScheduleTypes,
    schedulesAt: z
      .string()
      .refine(isFutureScheduleTime, { message: FUTURE_SCHEDULE_MESSAGE })
      .nullable(),
    contactFilter: contactFilterRequest.shape.contactFilter,
    saveAsDraft: z.boolean().optional(),
  })
  .refine((data) => !!(data.flowId || data.templateId), {
    message: "Either flow or template must be selected",
    path: ["flowId"],
  })
  // Send-blocking WhatsApp template rules (MPM sections, LTO expiration):
  // the flow editor enforces them at publish, this refinement covers the
  // broadcast surface with the same shared rule set.
  .superRefine((data, ctx) => {
    if (data.channel === channelTypes.enum.whatsapp && data.templateData) {
      validateWaTemplateSendParams(data.templateData as WaTemplateParams, ctx, [
        "templateData",
      ])
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
