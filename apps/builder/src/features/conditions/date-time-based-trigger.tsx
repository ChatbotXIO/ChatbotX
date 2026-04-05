import {
  customFieldTypes,
  dateTimeTriggerTypes,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"

export const DateTimeBasedTrigger = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const triggerTypeOptions = [
    {
      label: t("trigger.atTheDayOf"),
      value: dateTimeTriggerTypes.enum.atTheDayOf,
    },
    { label: t("trigger.before"), value: dateTimeTriggerTypes.enum.before },
    { label: t("trigger.after"), value: dateTimeTriggerTypes.enum.after },
  ]
  const timeTypeOptions = [
    { label: t("trigger.day"), value: "days" },
    { label: t("trigger.hour"), value: "hours" },
    { label: t("trigger.minute"), value: "minutes" },
  ]
  const atOptions = Array.from({ length: 24 }).map((_, index) => ({
    label: `${index}:00`,
    value: index.toString(),
  }))

  const form = useFormContext()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="min-w-[150px] flex-1">
          {t("trigger.triggerGoesOff")}
        </div>
        <SelectField
          name={`${parentName}.value.triggerType`}
          options={triggerTypeOptions}
        />
        {form.watch(`${parentName}.value.triggerType`) !==
          dateTimeTriggerTypes.enum.atTheDayOf && (
          <>
            <InputField name={`${parentName}.value.timeValue`} type="number" />
            <SelectField
              name={`${parentName}.value.timeType`}
              options={timeTypeOptions}
            />
          </>
        )}
      </div>

      <CustomFieldSelect
        customFieldTypes={[
          customFieldTypes.enum.datetime,
          customFieldTypes.enum.date,
        ]}
        label=""
        name={`${parentName}.sourceId`}
      />

      {form.watch(`${parentName}.value.triggerType`) ===
        dateTimeTriggerTypes.enum.atTheDayOf && (
        <div className="flex items-center gap-2">
          <div>{t("trigger.at")}</div>
          <SelectField name={`${parentName}.value.at`} options={atOptions} />
        </div>
      )}
    </div>
  )
}
