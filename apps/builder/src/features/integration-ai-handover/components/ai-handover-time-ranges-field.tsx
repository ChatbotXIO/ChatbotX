"use client"

import {
  AI_HANDOVER_DAY_END_HOUR,
  AI_HANDOVER_MAX_TIME_RANGES,
  aiHandoverTimeRangeSchema,
} from "@chatbotx.io/database/partials"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import type { SaveAiHandoverSettingsRequest } from "../schema/request"

/** Window offered when the schedule is switched on with none configured yet. */
const DEFAULT_TIME_RANGE = { from: 8, to: 17 } as const

/**
 * The "Run time" switch and its hour windows. Lives in the settings form (reads
 * it through the form context). Switching the schedule off also drops the
 * windows that could not be saved: they are hidden then, but the form still
 * validates them, so a hidden invalid range would block Save with no visible
 * reason.
 */
export function AiHandoverTimeRangesField() {
  const t = useTranslations()
  const form = useFormContext<SaveAiHandoverSettingsRequest>()
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "timeRanges",
  })
  const isScheduleEnabled = form.watch("scheduleEnabled")

  const onScheduleChange = (checked: boolean) => {
    form.setValue("scheduleEnabled", checked, { shouldDirty: true })
    if (checked && fields.length === 0) {
      append(DEFAULT_TIME_RANGE)
    }
    if (!checked) {
      form.setValue(
        "timeRanges",
        form
          .getValues("timeRanges")
          .filter(
            (range) => aiHandoverTimeRangeSchema.safeParse(range).success,
          ),
        { shouldDirty: true },
      )
      form.clearErrors("timeRanges")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SwitchField
        description={t("aiHandover.schedule.description")}
        label={t("aiHandover.schedule.label")}
        name="scheduleEnabled"
        onCheckedChange={onScheduleChange}
        required
      />
      {isScheduleEnabled && (
        <div className="flex flex-col gap-2">
          {fields.map((item, index) => (
            <div className="flex items-end gap-2" key={item.id}>
              <InputNumberField
                formItemClassName="flex-1"
                label={t("aiHandover.schedule.from")}
                max={AI_HANDOVER_DAY_END_HOUR}
                min={0}
                name={`timeRanges.${index}.from`}
                required
              />
              <InputNumberField
                formItemClassName="flex-1"
                label={t("aiHandover.schedule.to")}
                max={AI_HANDOVER_DAY_END_HOUR}
                min={0}
                name={`timeRanges.${index}.to`}
                required
              />
              <Button
                aria-label={t("aiHandover.schedule.remove")}
                onClick={() => remove(index)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
          ))}
          {form.formState.errors.timeRanges && (
            <p className="text-destructive text-sm" role="alert">
              {t("aiHandover.errors.timeRanges")}
            </p>
          )}
          <div>
            <Button
              disabled={fields.length >= AI_HANDOVER_MAX_TIME_RANGES}
              onClick={() => append(DEFAULT_TIME_RANGE)}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon aria-hidden />
              {t("aiHandover.schedule.add")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
