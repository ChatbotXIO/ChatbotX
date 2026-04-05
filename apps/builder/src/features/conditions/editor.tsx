import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useFormContext } from "react-hook-form"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { CustomFieldValueChanged } from "./custom-field-value-changed"
import { DateTimeBasedTrigger } from "./date-time-based-trigger"

export const ConditionEditor = ({
  parentName,
  type,
}: {
  parentName: string
  type: TriggerEventType
}) => {
  const tagOptions = useTagSelectOptions()
  const form = useFormContext()

  switch (type) {
    case triggerEventTypes.enum.tagApplied:
    case triggerEventTypes.enum.tagRemoved: {
      return (
        <SelectField name={`${parentName}.sourceId`} options={tagOptions} />
      )
    }
    case triggerEventTypes.enum.dateTimeBasedTrigger:
      return <DateTimeBasedTrigger parentName={parentName} />
    case triggerEventTypes.enum.customFieldValueChanged:
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
