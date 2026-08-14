import type { appointmentService } from "@chatbotx.io/business"

export type AppointmentManagementListItem = Awaited<
  ReturnType<typeof appointmentService.list>
>["data"][number]
