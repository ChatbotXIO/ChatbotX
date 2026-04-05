import {
  broadcastScheduleTypes,
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { waTemplateParamsSchema } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/query"

export const createBroadcastRequest = z
  .object({
    channel: channelTypes,
    flowId: zodBigintAsString().optional(),
    templateId: zodBigintAsString().optional(),
    integrationWhatsappId: zodBigintAsString().optional(),
    templateData: waTemplateParamsSchema.optional(),
    subaction: broadcastSubactions,
    schedulesType: broadcastScheduleTypes,
    schedulesAt: z
      .string()
      .refine(
        (value) => {
          const date = new Date(value)
          const currentDate = new Date()

          return !Number.isNaN(date.getTime()) && date > currentDate
        },
        {
          message: "Schedules must be after now.",
        },
      )
      .nullable(),
    contactFilter: contactFilterRequest.shape.contactFilter,
  })
  .refine(
    (data) => {
      return !!(data.flowId || data.templateId)
    },
    {
      message: "Either flow or template must be selected",
      path: ["flowId"],
    },
  )
export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequest>

export const updateBroadcastSchema = z.object({
  name: z.string().trim().min(1).max(255),
})
export type UpdateBroadcastSchema = z.infer<typeof updateBroadcastSchema>
