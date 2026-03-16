"use client"

import { TriggerAction } from "@aha.chat/database/enums"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { defaultFn as addTagsAction } from "./components/actions/schemas/add-tags"
import { defaultFn as clearCustomFieldAction } from "./components/actions/schemas/clear-custom-field"
import { defaultFn as removeTagsAction } from "./components/actions/schemas/remove-tags"
import { defaultFn as runGoogleSheetAction } from "./components/actions/schemas/run-google-sheet"
import { defaultFn as setCustomFieldAction } from "./components/actions/schemas/set-custom-field"
import { defaultFn as startFlowAction } from "./components/actions/schemas/start-flow"
import { defaultFn as transferConversationToHumanAction } from "./components/actions/schemas/transfer-conversation-to-human"

type ActionOption = {
  label: string
  value: TriggerAction
  defaultFn:
    | typeof addTagsAction
    | typeof removeTagsAction
    | typeof setCustomFieldAction
    | typeof clearCustomFieldAction
    | typeof startFlowAction
    | typeof transferConversationToHumanAction
    | typeof runGoogleSheetAction
}

export function AddAction({
  onAdd,
}: {
  onAdd: (option: ActionOption) => void
}) {
  const t = useTranslations()
  const options = useMemo(
    () => [
      {
        label: t("trigger.actions.addTag"),
        value: TriggerAction.addTag,
        defaultFn: addTagsAction,
      },
      {
        label: t("trigger.actions.removeTag"),
        value: TriggerAction.removeTag,
        defaultFn: removeTagsAction,
      },
      {
        label: t("trigger.actions.setCustomField"),
        value: TriggerAction.setCustomField,
        defaultFn: setCustomFieldAction,
      },
      {
        label: t("trigger.actions.clearCustomField"),
        value: TriggerAction.clearCustomField,
        defaultFn: clearCustomFieldAction,
      },
      {
        label: t("trigger.actions.startAnotherFlow"),
        value: TriggerAction.startAnotherFlow,
        defaultFn: startFlowAction,
      },
      {
        label: t("trigger.actions.transferConversationToHuman"),
        value: TriggerAction.transferConversationToHuman,
        defaultFn: transferConversationToHumanAction,
      },
      {
        label: "Google Sheets",
        value: TriggerAction.runGoogleSheet,
        defaultFn: runGoogleSheetAction,
      },
    ],
    [t],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <PlusIcon />
          {t("actions.addAction")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((option) => (
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
