import { appointmentCalendarService } from "@chatbotx.io/business"
import { verifyAppointmentWebviewToken } from "@chatbotx.io/encryption"
import type { Metadata } from "next"
import Script from "next/script"
import { getTranslations } from "next-intl/server"
import { DateRangePicker } from "@/features/booking-webview/components/date-range-picker"

export const runtime = "nodejs"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookingWebview")
  return {
    title: t("range.metadataTitle"),
  }
}

export default async function BookingRangePickerPage({
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
    if (payload.mode !== "selectAvailabilityRange") {
      throw new Error("Invalid appointment range token mode")
    }

    const calendar = await appointmentCalendarService.findByOrFail({
      workspaceId: payload.workspaceId,
      id: payload.calendarId,
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
        <DateRangePicker
          calendarName={calendar.name}
          closeOnSuccess={closeOnSuccess}
          description={calendar.description}
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
