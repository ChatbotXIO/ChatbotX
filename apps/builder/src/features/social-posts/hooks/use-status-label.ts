import { useTranslations } from "next-intl"
import type { CalendarItem } from "../lib/calendar-items"

/** Static keys, so the i18n guard checks each one exists in every locale source. */
export const useStatusLabel = (): ((
  status: CalendarItem["status"],
) => string) => {
  const t = useTranslations()
  const labels: Record<CalendarItem["status"], string> = {
    cancelled: t("composer.status.cancelled"),
    draft: t("posts.calendar.status.draft"),
    failed: t("composer.status.failed"),
    needsReview: t("composer.status.needsReview"),
    pending: t("composer.status.pending"),
    processing: t("composer.status.processing"),
    published: t("composer.status.published"),
    publishing: t("composer.status.publishing"),
  }
  return (status) => labels[status]
}
