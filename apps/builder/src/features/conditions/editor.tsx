import { TriggerCondition } from "@aha.chat/database/enums"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useFormContext } from "react-hook-form"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { CustomFieldValueChanged } from "./custom-field-value-changed"
import { DateTimeBasedTrigger } from "./date-time-based-trigger"

export const ConditionEditor = ({
  parentName,
  type,
}: {
  parentName: string
  type: TriggerCondition
}) => {
  const tagOptions = useTagSelectOptions()
  const form = useFormContext()

  switch (type) {
    case TriggerCondition.tagApplied:
    case TriggerCondition.tagRemoved: {
      return (
        <SelectField name={`${parentName}.sourceId`} options={tagOptions} />
      )
    }
    case TriggerCondition.dateTimeBasedTrigger:
      return <DateTimeBasedTrigger parentName={parentName} />
    case TriggerCondition.customFieldValueChanged:
      return <CustomFieldValueChanged parentName={parentName} />
    default:
      return (
        <>
          <InputField type="hidden" {...form.register(`${parentName}.id`)} />
          <InputField type="hidden" {...form.register(`${parentName}.type`)} />
          <InputField
            type="hidden"
            {...form.register(`${parentName}.sourceId`)}
          />
          <InputField
            type="hidden"
            {...form.register(`${parentName}.operator`)}
          />
          <InputField type="hidden" {...form.register(`${parentName}.value`)} />
        </>
      )
  }
}
