import { appointmentService } from "@chatbotx.io/business"
import {
  signAppointmentCancelToken,
  verifyAppointmentScheduleToken,
} from "@chatbotx.io/encryption"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { CancelAppointmentPanel } from "@/features/booking-webview/components/cancel-appointment-panel"

export const runtime = "nodejs"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookingWebview.schedule")
  return {
    title: t("metadataTitle"),
  }
}

const statusLabelKeyByStatus = {
  scheduled: "schedule.status.scheduled",
  cancelled: "schedule.status.cancelled",
} as const

export default async function BookingSchedulePage({
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
    const payload = await verifyAppointmentScheduleToken(token)
    const detail = await appointmentService.getScheduleDetailByToken(payload)
    const cancelToken = await signAppointmentCancelToken({
      appointmentId: detail.id,
      workspaceId: detail.workspaceId,
      contactId: detail.contactId,
      conversationId: detail.conversationId ?? undefined,
      contactInboxId: payload.contactInboxId,
      flowVersionId: payload.flowVersionId,
    })

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 p-6">
        <div className="space-y-3">
          <Badge
            variant={detail.status === "scheduled" ? "default" : "outline"}
          >
            {t(statusLabelKeyByStatus[detail.status])}
          </Badge>
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl tracking-normal">
              {detail.calendarName}
            </h1>
            <p className="text-muted-foreground">
              {detail.confirmationMessage ?? t("schedule.defaultMessage")}
            </p>
          </div>
        </div>

        <dl className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
          <DetailItem label={t("schedule.fields.invitee")}>
            {detail.contactName ?? t("schedule.unknownInvitee")}
          </DetailItem>
          <DetailItem label={t("schedule.fields.time")}>
            {formatDateTime(detail.startAt, detail.inviteeTimezone)}
          </DetailItem>
          <DetailItem label={t("schedule.fields.timezone")}>
            {detail.inviteeTimezone}
          </DetailItem>
          <DetailItem label={t("schedule.fields.location")}>
            {formatLocation(detail.locationType, detail.locationDetail, t)}
          </DetailItem>
        </dl>

        {detail.cancellable ? (
          <CancelAppointmentPanel token={cancelToken} />
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

function DetailItem({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-medium text-sm">{children}</dd>
    </div>
  )
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
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value)
}

function formatLocation(
  locationType: string,
  locationDetail: string | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (locationDetail) {
    return locationDetail
  }
  if (locationType === "phoneCall") {
    return t("schedule.locationTypes.phoneCall")
  }
  if (locationType === "onlineMeeting") {
    return t("schedule.locationTypes.onlineMeeting")
  }
  return t("schedule.locationTypes.inPerson")
}
