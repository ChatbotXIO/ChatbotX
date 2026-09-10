import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListResponse } from "@/lib/public-api/list"

// Mirrors `ExternalCalendarListItem`
// (packages/business/src/appointment-external-calendar/service.ts) — the
// return shape of `appointmentExternalCalendarService.listWithConnectedCount`,
// the only safe read of this resource. Its sibling `list()` method returns
// raw `Integration` rows joined with `IntegrationGoogleCalendar`, whose
// `auth` column holds the OAuth token blob — never expose that method on a
// public route. `workspaceId` is omitted; see
// `public-spec-operations.test.ts`'s full sweep.
export const appointmentExternalCalendarPublicResource = z.object({
  id: z.string(),
  providerType: z.literal("googleCalendar"),
  label: z.string(),
  providerCalendarId: z.string(),
  email: z.string().nullable(),
  connectedCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type AppointmentExternalCalendarPublicResource = z.infer<
  typeof appointmentExternalCalendarPublicResource
>

export const listAppointmentExternalCalendarsPublicResponse =
  publicListResponse(appointmentExternalCalendarPublicResource)

export const appointmentExternalCalendarIdPublicRequest = z.object({
  integrationId: zodBigintAsString(),
})
