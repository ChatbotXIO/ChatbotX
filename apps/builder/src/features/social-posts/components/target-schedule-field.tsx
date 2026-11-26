"use client"

import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useTranslations } from "next-intl"
import {
  instantToWallClock,
  wallClockToInstant,
} from "@/components/calendar/calendar-grid"
import { isTargetTimeValid } from "../lib/composer-state"

const PICKER_FORMAT = "yyyy-MM-dd HH:mm"
const DEFAULT_LEAD_MS = 60 * 60 * 1000

/**
 * "Separate time for this channel": a time of its own, picked as the wall
 * clock of the workspace's time zone, instead of the post's time. Valid from
 * 2 minutes to one year ahead, like the post's own time.
 */
export const TargetScheduleField = ({
  disabled,
  onChange,
  timezone,
  value,
}: {
  disabled: boolean
  onChange: (scheduledAt: Date | null) => void
  timezone: string
  value: Date | null
}) => {
  const t = useTranslations("composer")
  const isInvalid = value !== null && !isTargetTimeValid(value)
  return (
    <div className="space-y-2">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control */}
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={value !== null}
          disabled={disabled}
          onCheckedChange={(own) =>
            onChange(own ? new Date(Date.now() + DEFAULT_LEAD_MS) : null)
          }
        />
        {t("targetOwnTime")}
      </label>
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <DateTimePicker
            disabled={disabled ? true : { before: new Date() }}
            displayFormat={{ hour24: PICKER_FORMAT }}
            granularity="minute"
            onChange={(wallClock) =>
              onChange(
                wallClock ? wallClockToInstant(wallClock, timezone) : null,
              )
            }
            placeholder={t("pickTime")}
            value={instantToWallClock(value, timezone)}
          />
          <span className="text-muted-foreground text-xs">{timezone}</span>
        </div>
      ) : null}
      {isInvalid ? (
        <p className="text-destructive text-sm" role="alert">
          {t("targetTimeInvalid")}
        </p>
      ) : null}
    </div>
  )
}
