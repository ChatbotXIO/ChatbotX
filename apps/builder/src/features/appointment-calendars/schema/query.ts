import type { AppointmentCalendarModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { DEFAULT_SLOT_WINDOW_DAYS } from "@/features/booking-webview/lib/slots"
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

const MAX_AVAILABILITY_WINDOW_MS =
  DEFAULT_SLOT_WINDOW_DAYS * 24 * 60 * 60 * 1000

export const getContactAvailabilityRequest = withWorkspaceIdSchema.and(
  z
    .object({
      calendarId: zodBigintAsString(),
      contactId: zodBigintAsString(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
    })
    .superRefine((value, ctx) => {
      const span = value.endDate.getTime() - value.startDate.getTime()
      if (span < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "endDate must be on or after startDate",
        })
      } else if (span > MAX_AVAILABILITY_WINDOW_MS) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: `The range cannot exceed ${DEFAULT_SLOT_WINDOW_DAYS} days`,
        })
      }
    }),
)

export type GetContactAvailabilityRequest = z.infer<
  typeof getContactAvailabilityRequest
>

export const getContactAvailabilityResponse = z.object({
  timezone: z.string(),
  slots: z.array(z.object({ startAt: z.date(), endAt: z.date() })),
})

export type GetContactAvailabilityResponse = z.infer<
  typeof getContactAvailabilityResponse
>
