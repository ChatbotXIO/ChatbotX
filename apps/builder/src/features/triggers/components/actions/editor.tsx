import {
  type TriggerAction,
  triggerActions,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
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
    case triggerActions.enum.addTag:
    case triggerActions.enum.removeTag: {
      return (
        <MultiSelectField
          label=""
          name={`${parentName}.tagIds`}
          options={tagSelectOptions}
        />
      )
    }
    case triggerActions.enum.setCustomField:
      return (
        <div className="flex flex-col gap-4">
          <SetCustomField parentName={parentName} />
        </div>
      )
    case triggerActions.enum.clearCustomField:
      return <CustomFieldSelect label="" name={`${parentName}.customFieldId`} />
    case triggerActions.enum.startAnotherFlow:
      return (
        <ComboboxField
          name={`${parentName}.flowId`}
          options={flowOptions}
          required={true}
        />
      )
    case triggerActions.enum.transferConversationToHuman:
      return (
        <SwitchField
          label={t("trigger.actions.notifyAdmins")}
          name={`${parentName}.notifyAdmins`}
          required
        />
      )
    case triggerActions.enum.runGoogleSheet:
      return <GoogleSheetAction parentName={parentName} />
    default:
      return null
  }
}
