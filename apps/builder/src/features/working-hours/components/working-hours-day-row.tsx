"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  canAddInterval,
  type IndexedInterval,
  type ScheduleError,
} from "../lib/schedule-state"
import {
  END_SELECT_ITEMS,
  formatMinute,
  START_SELECT_ITEMS,
} from "../lib/time-options"

type WorkingHoursDayRowProps = {
  weekday: number
  dayLabel: string
  rows: IndexedInterval[]
  error: ScheduleError | undefined
  disabled: boolean
  onToggle: (enabled: boolean) => void
  onAdd: () => void
  onRemove: (index: number) => void
  onChange: (
    index: number,
    boundary: "startMinute" | "endMinute",
    minute: number,
  ) => void
}

export function MinuteSelect({
  items,
  value,
  label,
  disabled,
  onChange,
}: {
  items: { label: string; value: string }[]
  value: number
  label: string
  disabled: boolean
  onChange: (minute: number) => void
}) {
  return (
    <Select
      disabled={disabled}
      items={items}
      onValueChange={(next) => next !== null && onChange(Number(next))}
      value={String(value)}
    >
      <SelectTrigger aria-label={label} className="w-28 tabular-nums">
        <SelectValue>{formatMinute(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-64 min-w-(--anchor-width)">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function WorkingHoursDayRow({
  weekday,
  dayLabel,
  rows,
  error,
  disabled,
  onToggle,
  onAdd,
  onRemove,
  onChange,
}: WorkingHoursDayRowProps) {
  const t = useTranslations()
  const enabled = rows.length > 0
  const intervals = rows.map((row) => row.interval)

  return (
    <div
      className="grid gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[11rem_1fr]"
      data-weekday={weekday}
    >
      <div className="flex items-center gap-3 sm:h-9">
        <Switch
          aria-label={t("workingHours.editor.dayToggle", { day: dayLabel })}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
        <span className="font-medium text-sm">{dayLabel}</span>
      </div>
      <div className="flex flex-col gap-2">
        {enabled ? (
          <>
            {rows.map(({ index, interval }) => (
              <div className="flex items-center gap-2" key={index}>
                <MinuteSelect
                  disabled={disabled}
                  items={START_SELECT_ITEMS}
                  label={t("workingHours.editor.startTime")}
                  onChange={(minute) => onChange(index, "startMinute", minute)}
                  value={interval.startMinute}
                />
                <span aria-hidden="true" className="text-muted-foreground">
                  –
                </span>
                <MinuteSelect
                  disabled={disabled}
                  items={END_SELECT_ITEMS}
                  label={t("workingHours.editor.endTime")}
                  onChange={(minute) => onChange(index, "endMinute", minute)}
                  value={interval.endMinute}
                />
                <Button
                  aria-label={t("workingHours.editor.removeRange")}
                  disabled={disabled}
                  onClick={() => onRemove(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error === "overlap"
                  ? t("workingHours.editor.errorOverlap")
                  : t("workingHours.editor.errorOrder")}
              </p>
            )}
            <Button
              className="self-start"
              disabled={disabled || !canAddInterval(intervals, weekday)}
              onClick={onAdd}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon />
              {t("actions.addNew")}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm sm:leading-9">
            {t("workingHours.editor.notWorking")}
          </p>
        )}
      </div>
    </div>
  )
}
