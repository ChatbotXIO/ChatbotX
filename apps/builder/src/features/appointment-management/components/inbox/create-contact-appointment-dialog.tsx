"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useQuery } from "@tanstack/react-query"
import { CalendarPlusIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AppointmentCalendarSelect } from "@/features/appointment-calendars/components/appointment-calendar-select"
import {
  SlotPicker,
  SlotTimezoneSelect,
} from "@/features/booking-webview/components/slot-picker"
import {
  DEFAULT_SLOT_WINDOW_DAYS,
  formatFullLabel,
} from "@/features/booking-webview/lib/slots"
import { orpc } from "@/lib/orpc/query"
import { bookContactAppointmentAction } from "../../actions/book-contact-appointment.action"
import { useInvalidateAppointments } from "../../lib/use-invalidate-appointments"

const DAY_MS = 24 * 60 * 60 * 1000

type CreateContactAppointmentDialogProps = {
  workspaceId: string
  contactId: string
  /**
   * The open conversation. When set, the contact gets the confirmation on
   * their most recently active inbox; without it the booking is silent.
   */
  conversationId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Books an available slot on a calendar for a contact, straight from the
 * inbox's contact panel — the same slot picker as the public booking page.
 */
export function CreateContactAppointmentDialog({
  workspaceId,
  contactId,
  conversationId,
  open,
  onOpenChange,
}: CreateContactAppointmentDialogProps) {
  const t = useTranslations()
  const invalidateAppointments = useInvalidateAppointments()
  const [calendarId, setCalendarId] = useState<string | null>(null)
  const [timezoneOverride, setTimezoneOverride] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<
    "staleSlot" | "availabilityChanged" | "alreadyScheduled" | null
  >(null)

  // One fixed window per opened calendar, so the query key stays stable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute "now" on reopen and on calendar change
  const range = useMemo(() => {
    const startDate = new Date()
    return {
      startDate,
      endDate: new Date(
        startDate.getTime() + DEFAULT_SLOT_WINDOW_DAYS * DAY_MS,
      ),
    }
  }, [open, calendarId])

  const availability = useQuery({
    ...orpc.appointmentCalendarsAPI.getContactAvailabilityAPI.queryOptions({
      input: {
        workspaceId,
        calendarId: calendarId ?? "",
        contactId,
        startDate: range.startDate,
        endDate: range.endDate,
      },
    }),
    enabled: open && Boolean(calendarId),
  })
  const slots = useMemo(
    () =>
      (availability.data?.slots ?? []).map((slot) => ({
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
      })),
    [availability.data],
  )
  const calendarTimezone = availability.data?.timezone ?? "UTC"
  const selectedTimezone = timezoneOverride ?? calendarTimezone

  const reset = () => {
    setCalendarId(null)
    setTimezoneOverride(null)
    setSelectedSlot(null)
    setSlotError(null)
  }
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset()
    }
    onOpenChange(next)
  }

  const { execute, isPending } = useAction(
    bookContactAppointmentAction.bind(null, workspaceId),
    {
      onSuccess: async ({ data }) => {
        if (data?.completed) {
          await invalidateAppointments()
          toast.success(t("appointments.create.success"))
          handleOpenChange(false)
          return
        }
        if (data?.alreadyScheduled) {
          // The slot is still open for others; keep the list and the selection
          // so the agent can pick another start.
          setSlotError("alreadyScheduled")
          return
        }
        if (data?.staleSlot || data?.availabilityChanged) {
          setSlotError(data.staleSlot ? "staleSlot" : "availabilityChanged")
          setSelectedSlot(null)
          await availability.refetch()
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const notifiesContact = Boolean(conversationId)

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("appointments.create.title")}</DialogTitle>
          <DialogDescription>
            {t("appointments.create.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {notifiesContact ? null : (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
              {t("appointments.create.noConversationHint")}
            </p>
          )}

          <AppointmentCalendarSelect
            disabled={isPending}
            enabled={open}
            onValueChange={(next) => {
              setCalendarId(next)
              setTimezoneOverride(null)
              setSelectedSlot(null)
              setSlotError(null)
            }}
            value={calendarId}
            workspaceId={workspaceId}
          />

          {calendarId ? (
            <AvailabilityState
              isError={availability.isError}
              isPending={availability.isPending}
              onRetry={() => availability.refetch()}
            />
          ) : null}

          {calendarId && availability.data ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium text-sm">
                  {t("bookingWebview.timezone")}
                </p>
                <SlotTimezoneSelect
                  disabled={isPending}
                  onValueChange={setTimezoneOverride}
                  value={selectedTimezone}
                />
              </div>

              {slotError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                  {t(`bookingWebview.errors.${slotError}`)}
                </div>
              ) : null}

              <SlotPicker
                disabled={isPending}
                key={calendarId}
                onInteract={() => setSlotError(null)}
                onSelectSlot={setSelectedSlot}
                selectedSlot={selectedSlot}
                selectedTimezone={selectedTimezone}
                slots={slots}
                timezone={calendarTimezone}
              />
            </>
          ) : null}
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="truncate text-sm">
            {selectedSlot
              ? formatFullLabel(selectedSlot, selectedTimezone)
              : t("bookingWebview.noSelection")}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={!(calendarId && selectedSlot) || isPending}
              onClick={() => {
                if (!(calendarId && selectedSlot)) {
                  return
                }
                execute({
                  calendarId,
                  contactId,
                  conversationId: conversationId ?? undefined,
                  startAt: selectedSlot,
                  inviteeTimezone: selectedTimezone,
                })
              }}
              type="button"
            >
              {isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <CalendarPlusIcon className="size-4" />
              )}
              {t("appointments.actions.create")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AvailabilityState({
  isError,
  isPending,
  onRetry,
}: {
  isError: boolean
  isPending: boolean
  onRetry: () => Promise<unknown>
}) {
  const t = useTranslations()

  if (isPending) {
    return (
      <div className="flex justify-center py-4">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <span>{t("messages.errorLoadingData")}</span>
        <Button onClick={onRetry} size="sm" type="button" variant="ghost">
          {t("actions.retry")}
        </Button>
      </div>
    )
  }
  return null
}
