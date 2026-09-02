import { appointmentCalendarService } from "@chatbotx.io/business"
import { verifyAppointmentWebviewToken } from "@chatbotx.io/encryption"
import type { Metadata } from "next"
import Script from "next/script"
import { getTranslations } from "next-intl/server"
import { DateTimePicker } from "@/features/booking-webview/components/date-time-picker"

export const runtime = "nodejs"

const DEFAULT_SLOT_WINDOW_DAYS = 90

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookingWebview")
  return {
    title: t("metadataTitle"),
  }
}

export default async function BookingPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const t = await getTranslations("bookingWebview")
  const token = (await searchParams).token
  if (!token) {
    return (
      <PublicMessage
        description={t("errors.invalidTokenDescription")}
        title={t("errors.invalidTokenTitle")}
      />
    )
  }

  try {
    const payload = await verifyAppointmentWebviewToken(token)
    if (payload.mode === "selectAvailabilityRange") {
      throw new Error("Availability range tokens cannot use booking picker")
    }

    const calendar = await appointmentCalendarService.findByOrFail({
      workspaceId: payload.workspaceId,
      id: payload.calendarId,
    })
    const startDate = payload.availabilityStartAt
      ? new Date(payload.availabilityStartAt)
      : new Date()
    const endDate = payload.availabilityEndAt
      ? new Date(payload.availabilityEndAt)
      : new Date(
          startDate.getTime() + DEFAULT_SLOT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        )
    const slots =
      await appointmentCalendarService.resolveAvailableSlotsForListing({
        workspaceId: payload.workspaceId,
        calendarId: payload.calendarId,
        contactId: payload.contactId,
        startDate,
        endDate,
      })

    const closeOnSuccess = Boolean(payload.nodeId)

    return (
      <>
        {closeOnSuccess ? (
          <Script
            src="https://connect.facebook.net/en_US/messenger.Extensions.js"
            strategy="afterInteractive"
          />
        ) : null}
        <DateTimePicker
          calendarName={calendar.name}
          closeOnSuccess={closeOnSuccess}
          description={calendar.description}
          slots={slots.map((slot) => ({
            startAt: slot.startAt.toISOString(),
            endAt: slot.endAt.toISOString(),
          }))}
          submitMode={payload.mode === "selectAvailability" ? "select" : "book"}
          timezone={calendar.timezone}
          token={token}
        />
      </>
    )
  } catch {
    return (
      <PublicMessage
        description={t("errors.invalidTokenDescription")}
        title={t("errors.invalidTokenTitle")}
      />
    )
  }
}

function PublicMessage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  )
}
