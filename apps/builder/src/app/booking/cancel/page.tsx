import { appointmentService } from "@chatbotx.io/business"
import { verifyAppointmentCancelToken } from "@chatbotx.io/encryption"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CancelAppointmentPanel } from "@/features/booking-webview/components/cancel-appointment-panel"

export const runtime = "nodejs"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookingWebview.cancel")
  return {
    title: t("metadataTitle"),
  }
}

export default async function BookingCancelPage({
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
    const payload = await verifyAppointmentCancelToken(token)
    const detail = await appointmentService.getScheduleDetailByToken(payload)

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-normal">
            {t("cancel.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("cancel.description", {
              calendar: detail.calendarName,
              time: formatDateTime(detail.startAt, detail.inviteeTimezone),
            })}
          </p>
        </div>
        {detail.cancellable ? (
          <CancelAppointmentPanel token={token} />
        ) : (
          <div className="rounded-md border bg-muted/40 p-4 text-sm">
            <p className="font-medium">{t("cancel.unavailableTitle")}</p>
            <p className="text-muted-foreground">
              {t("cancel.unavailableDescription")}
            </p>
          </div>
        )}
      </main>
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

function formatDateTime(value: Date, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value)
}
