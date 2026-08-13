import type { AppointmentCalendarModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export const listAppointmentCalendarsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<AppointmentCalendarModel>().withDefault([
    { id: "name", desc: false },
  ]),
}

export const listAppointmentCalendarsSearchParamsCache =
  createSearchParamsCache(listAppointmentCalendarsSearchParams)

export type ListAppointmentCalendarsRequest = Awaited<
  ReturnType<typeof listAppointmentCalendarsSearchParamsCache.parse>
> & { workspaceId: string }

export const listAppointmentCalendarsForFlowRequest = withWorkspaceIdSchema.and(
  z.object({
    keyword: z.string().optional(),
  }),
)

export const listAppointmentCalendarsForFlowResponse = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
  }),
)

export type ListAppointmentCalendarsForFlowResponse = z.infer<
  typeof listAppointmentCalendarsForFlowResponse
>
