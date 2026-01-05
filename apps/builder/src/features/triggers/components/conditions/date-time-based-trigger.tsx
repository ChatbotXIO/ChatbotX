import { DateTimeTriggerType } from "@aha.chat/database/enums"
import { CustomFieldType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
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
    { label: t("trigger.atTheDayOf"), value: DateTimeTriggerType.atTheDayOf },
    { label: t("trigger.before"), value: DateTimeTriggerType.before },
    { label: t("trigger.after"), value: DateTimeTriggerType.after },
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
          name={`${parentName}.triggerType`}
          options={triggerTypeOptions}
        />
        {form.watch(`${parentName}.triggerType`) !==
          DateTimeTriggerType.atTheDayOf && (
          <>
            <InputField name={`${parentName}.timeValue`} type="number" />
            <SelectField
              name={`${parentName}.timeType`}
              options={timeTypeOptions}
            />
          </>
        )}
      </div>

      <CustomFieldSelect
        customFieldTypes={[CustomFieldType.datetime, CustomFieldType.date]}
        label=""
        name={`${parentName}.customFieldId`}
      />

      {form.watch(`${parentName}.triggerType`) ===
        DateTimeTriggerType.atTheDayOf && (
        <div className="flex items-center gap-2">
          <div>{t("trigger.at")}</div>
          <SelectField name={`${parentName}.at`} options={atOptions} />
        </div>
      )}
    </div>
  )
}
