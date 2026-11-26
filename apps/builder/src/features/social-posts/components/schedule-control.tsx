"use client"

import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import { useTranslations } from "next-intl"

const PICKER_FORMAT = "yyyy-MM-dd HH:mm"

/** The publish time of a scheduled post, picked as the wall clock of the workspace's time zone. */
export const ScheduleControl = ({
  disabled,
  isTooSoon,
  onChange,
  timezone,
  value,
}: {
  disabled: boolean
  isTooSoon: boolean
  onChange: (value: Date | undefined) => void
  timezone: string
  value: Date | undefined
}) => {
  const t = useTranslations()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{t("composer.scheduleAt")}</span>
        <DateTimePicker
          disabled={disabled ? true : { before: new Date() }}
          displayFormat={{ hour24: PICKER_FORMAT }}
          granularity="minute"
          onChange={onChange}
          placeholder={t("composer.pickTime")}
          value={value}
        />
        <span className="text-muted-foreground text-xs">{timezone}</span>
      </div>
      {isTooSoon ? (
        <p className="text-destructive text-sm" role="alert">
          {t("composer.scheduleTooSoon")}
        </p>
      ) : null}
    </div>
  )
}
