import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { getContactInfoTypeOptions } from "@/features/contact-filter/components/contact-filter-config"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { CategoryReferenceCondition } from "./category-reference-condition"
import { CustomFieldValueChanged } from "./custom-field-value-changed"
import { DateTimeBasedTrigger } from "./date-time-based-trigger"
import { PipelineItemCondition } from "./pipeline-item-condition"
import { ProductReferenceCondition } from "./product-reference-condition"
import { isPipelineItemEventType } from "./schema/pipeline-item"

export const ConditionEditor = ({
  parentName,
  type,
}: {
  parentName: string
  type: TriggerEventType
}) => {
  const t = useTranslations()
  const tagOptions = useTagSelectOptions()
  const contactInfoTypeOptions = useMemo(
    () => getContactInfoTypeOptions(t),
    [t],
  )
  const sequences = useSequenceOptions()
  const sequenceOptions = useMemo(
    () =>
      sequences.map((sequence) => ({
        label: sequence.name,
        value: sequence.id,
      })),
    [sequences],
  )
  const form = useFormContext()

  if (isPipelineItemEventType(type)) {
    return <PipelineItemCondition parentName={parentName} type={type} />
  }
  switch (type) {
    case triggerEventTypes.enum.tagApplied:
    case triggerEventTypes.enum.tagRemoved: {
      return (
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          name={`${parentName}.sourceId`}
          options={tagOptions}
          placeholder={t("actions.pleaseSelect")}
          popoverClassName="w-[var(--anchor-width)]"
        />
      )
    }
    case triggerEventTypes.enum.contactInfoUpdated:
      return (
        <SelectField
          name={`${parentName}.sourceId`}
          options={contactInfoTypeOptions}
        />
      )
    case triggerEventTypes.enum.subscribedToSequence:
    case triggerEventTypes.enum.unsubscribedFromSequence:
      return (
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          name={`${parentName}.sourceId`}
          options={sequenceOptions}
          placeholder={t("actions.pleaseSelect")}
          popoverClassName="w-[var(--anchor-width)]"
        />
      )
    case triggerEventTypes.enum.shoppingCartSent:
    case triggerEventTypes.enum.userAskedAboutProduct:
    case triggerEventTypes.enum.productOrdered:
    case triggerEventTypes.enum.productAddedToCart:
    case triggerEventTypes.enum.productRemovedFromCart:
      return <ProductReferenceCondition parentName={parentName} />
    case triggerEventTypes.enum.categoryAddedToCart:
      return <CategoryReferenceCondition parentName={parentName} />
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
