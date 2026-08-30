import {
  appointmentCalendarModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const appointmentCalendarResource = createSelectSchema(
  appointmentCalendarModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    confirmationFlowId: z.string().nullable(),
    cancellationFlowId: z.string().nullable(),
    externalConnectionId: z.string().nullable(),
  },
)
export type AppointmentCalendarResource = z.infer<
  typeof appointmentCalendarResource
>

export type AppointmentCalendarListItem = Pick<
  AppointmentCalendarResource,
  | "id"
  | "workspaceId"
  | "name"
  | "active"
  | "timezone"
  | "publicLinkSlug"
  | "createdAt"
  | "updatedAt"
>
