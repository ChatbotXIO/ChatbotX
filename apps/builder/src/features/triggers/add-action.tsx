"use client"

import {
  type TriggerAction,
  triggerActions,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { defaultFn as addTagsAction } from "./components/actions/schema/add-tags"
import { defaultFn as clearCustomFieldAction } from "./components/actions/schema/clear-custom-field"
import { defaultFn as pipelineAction } from "./components/actions/schema/pipeline"
import { defaultFn as removeTagsAction } from "./components/actions/schema/remove-tags"
import { defaultFn as runGoogleSheetAction } from "./components/actions/schema/run-google-sheet"
import { defaultFn as sendGoogleAdsConversionAction } from "./components/actions/schema/send-google-ads-conversion"
import { defaultFn as sendMetaCapiEventAction } from "./components/actions/schema/send-meta-capi-event"
import { defaultFn as setCustomFieldAction } from "./components/actions/schema/set-custom-field"
import { defaultFn as startExternalStepAction } from "./components/actions/schema/start-external-step"
import { defaultFn as startFlowAction } from "./components/actions/schema/start-flow"
import { defaultFn as transferConversationToHumanAction } from "./components/actions/schema/transfer-conversation-to-human"

type ActionOption = {
  label: string
  value: TriggerAction
  defaultFn:
    | typeof addTagsAction
    | typeof removeTagsAction
    | typeof setCustomFieldAction
    | typeof clearCustomFieldAction
    | typeof startFlowAction
    | typeof startExternalStepAction
    | typeof transferConversationToHumanAction
    | typeof sendMetaCapiEventAction
    | typeof sendGoogleAdsConversionAction
    | typeof runGoogleSheetAction
    | typeof pipelineAction
}

export function AddAction({
  onAdd,
  allowedTypes,
}: {
  onAdd: (option: ActionOption) => void
  /** Limits the menu to these actions; every action is offered when omitted. */
  allowedTypes?: readonly TriggerAction[]
}) {
  const t = useTranslations()
  // Fixed picker order; the actions only ChatbotX has come last.
  const options = useMemo(
    () => [
      {
        label: t("trigger.actions.startAnotherFlow"),
        value: triggerActions.enum.startAnotherFlow,
        defaultFn: startFlowAction,
      },
      {
        label: t("trigger.actions.startExternalStep"),
        value: triggerActions.enum.startExternalStep,
        defaultFn: startExternalStepAction,
      },
      {
        label: t("trigger.actions.addTag"),
        value: triggerActions.enum.addTag,
        defaultFn: addTagsAction,
      },
      {
        label: t("trigger.actions.removeTag"),
        value: triggerActions.enum.removeTag,
        defaultFn: removeTagsAction,
      },
      {
        label: t("trigger.actions.setCustomField"),
        value: triggerActions.enum.setCustomField,
        defaultFn: setCustomFieldAction,
      },
      {
        label: t("trigger.actions.clearCustomField"),
        value: triggerActions.enum.clearCustomField,
        defaultFn: clearCustomFieldAction,
      },
      {
        label: t("trigger.actions.transferConversationToHuman"),
        value: triggerActions.enum.transferConversationToHuman,
        defaultFn: transferConversationToHumanAction,
      },
      {
        label: t("flows.actions.pipeline"),
        value: triggerActions.enum.pipeline,
        defaultFn: pipelineAction,
      },
      {
        label: "Google Sheets",
        value: triggerActions.enum.runGoogleSheet,
        defaultFn: runGoogleSheetAction,
      },
      {
        label: t("trigger.actions.sendMetaCapiEvent"),
        value: triggerActions.enum.sendMetaCapiEvent,
        defaultFn: sendMetaCapiEventAction,
      },
      {
        label: t("trigger.actions.sendGoogleAdsConversion"),
        value: triggerActions.enum.sendGoogleAdsConversion,
        defaultFn: sendGoogleAdsConversionAction,
      },
    ],
    [t],
  )

  const visibleOptions = useMemo(
    () =>
      allowedTypes
        ? options.filter((option) => allowedTypes.includes(option.value))
        : options,
    [options, allowedTypes],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            <PlusIcon />
            {t("actions.addAction")}
          </Button>
        }
      />
      <DropdownMenuContent>
        {visibleOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onAdd(option)
            }}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
