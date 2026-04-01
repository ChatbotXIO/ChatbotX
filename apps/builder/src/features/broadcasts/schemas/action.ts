import {
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { broadcastSchedulesType } from "@chatbotx.io/database/schema"
import { waTemplateParamsSchema } from "@chatbotx.io/flow-config"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/query"

export const createBroadcastRequest = z
  .object({
    channel: channelTypes,
    flowId: z.bigint().optional(),
    templateId: z.bigint().optional(),
    integrationWhatsappId: z.bigint().optional(),
    templateData: waTemplateParamsSchema.optional(),
    subaction: broadcastSubactions,
    schedulesType: z.enum(broadcastSchedulesType.enumValues),
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
