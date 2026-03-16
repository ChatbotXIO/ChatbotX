import { TriggerAction } from "@aha.chat/database/enums"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { useTranslations } from "next-intl"
import { SetCustomField } from "@/features/contacts/components/add-custom-field-dialog"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { GoogleSheetAction } from "./run-google-sheet"

export const ActionEditor = ({
  parentName,
  type,
}: {
  parentName: string
  type: TriggerAction
}) => {
  const t = useTranslations()
  const tagSelectOptions = useTagSelectOptions()
  const flowOptions = useFlowSelectOptions()

  switch (type) {
    case TriggerAction.addTag:
    case TriggerAction.removeTag: {
      return (
        <MultiSelectField
          label=""
          name={`${parentName}.tagIds`}
          options={tagSelectOptions}
        />
      )
    }
    case TriggerAction.setCustomField:
      return (
        <div className="flex flex-col gap-4">
          <SetCustomField parentName={parentName} />
        </div>
      )
    case TriggerAction.clearCustomField:
      return <CustomFieldSelect label="" name={`${parentName}.customFieldId`} />
    case TriggerAction.startAnotherFlow:
      return (
        <ComboboxField
          name={`${parentName}.flowId`}
          options={flowOptions}
          required={true}
        />
      )
    case TriggerAction.transferConversationToHuman:
      return (
        <SwitchField
          label={t("trigger.actions.notifyAdmins")}
          name={`${parentName}.notifyAdmins`}
          required
        />
      )
    case TriggerAction.runGoogleSheet:
      return <GoogleSheetAction parentName={parentName} />
    default:
      return null
  }
}
