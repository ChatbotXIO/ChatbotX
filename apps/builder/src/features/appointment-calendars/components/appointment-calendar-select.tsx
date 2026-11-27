"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useId } from "react"
import { orpc } from "@/lib/orpc/query"

type AppointmentCalendarSelectProps = {
  workspaceId: string
  value: string | null
  onValueChange: (calendarId: string | null) => void
  /** Load the calendars only while the surrounding dialog is open. */
  enabled?: boolean
  disabled?: boolean
}

/**
 * Picks one of the workspace's appointment calendars. Inactive calendars are
 * listed but cannot be chosen; with no calendars it links to the calendar
 * settings instead. Shared by the composer booking-link dialog and the
 * contact panel's create-appointment dialog.
 */
export function AppointmentCalendarSelect({
  workspaceId,
  value,
  onValueChange,
  enabled = true,
  disabled,
}: AppointmentCalendarSelectProps) {
  const t = useTranslations()
  const fieldId = useId()
  const calendars = useQuery({
    ...orpc.appointmentCalendarsAPI.listAppointmentCalendarsForFlowAPI.queryOptions(
      { input: { workspaceId } },
    ),
    enabled,
  })

  if (calendars.isPending) {
    return (
      <div className="flex justify-center py-2">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const options = calendars.data ?? []
  if (options.length === 0) {
    return (
      <div className="grid gap-1 text-muted-foreground text-sm">
        <p>{t("inbox.createAppointment.noCalendars")}</p>
        <Link
          className="text-primary underline-offset-4 hover:underline"
          href={`/space/${workspaceId}/appointment-calendars`}
        >
          {t("inbox.createAppointment.manageCalendars")}
        </Link>
      </div>
    )
  }

  return (
    <div className="grid w-full gap-2">
      <label className="font-medium text-sm leading-none" htmlFor={fieldId}>
        {t("appointmentCalendars.singular")}
      </label>
      <Select
        disabled={disabled}
        items={options.map((calendar) => ({
          label: calendar.name,
          value: calendar.id,
        }))}
        onValueChange={(next) => onValueChange(next ? String(next) : null)}
        value={value ?? ""}
      >
        <SelectTrigger className="w-full" id={fieldId}>
          <SelectValue placeholder={t("actions.pleaseSelect")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((calendar) => (
            <SelectItem
              disabled={!calendar.active}
              key={calendar.id}
              value={calendar.id}
            >
              {calendar.name}
              {calendar.active
                ? null
                : ` (${t("inbox.createAppointment.inactive")})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
