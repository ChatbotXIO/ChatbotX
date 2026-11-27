"use client"

import {
  THREAD_CONTROL_STEP_METADATA_MAX_LENGTH,
  threadControlStepActions,
  threadControlStepTargetRoles,
} from "@chatbotx.io/flow-config"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { ArrowRightLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import { THREAD_CONTROL_ROLE_LABEL_KEYS } from "@/features/conversations/utils/thread-control"
import { useTenantSettings } from "@/features/tenant/tenant-settings-provider"
import { BaseStepEditor } from "../base/editor"
import { THREAD_CONTROL_STEP_ACTION_KEYS } from "./labels"

const ThreadControlStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { name: brand } = useTenantSettings()
  const action = useWatch({ name: `${parentName}.action` })

  // The action list is deliberately NOT filtered by channel: a flow can run on
  // several channels, so the channel is unknown at config time. An action the
  // running channel cannot do (Messenger `release`) is refused at runtime as a
  // permanent ChannelError before any channel call, so the step takes its
  // error state and no routing state is recorded.
  return (
    <BaseStepEditor
      icon={ArrowRightLeftIcon}
      title={t("flows.actions.threadControl")}
    >
      <div className="flex w-[243px] flex-col gap-2">
        <RadioGroupField
          label={t("conversationRouting.step.action")}
          name={`${parentName}.action`}
          options={threadControlStepActions.options.map((option) => ({
            value: option,
            label: t(THREAD_CONTROL_STEP_ACTION_KEYS[option]),
          }))}
          required
        />
        {action === threadControlStepActions.enum.pass && (
          <>
            <SelectField
              allowClear
              label={t("conversationRouting.step.targetRole")}
              name={`${parentName}.targetRole`}
              options={threadControlStepTargetRoles.options.map((role) => ({
                value: role,
                label: t(THREAD_CONTROL_ROLE_LABEL_KEYS[role]),
              }))}
              placeholder={t("conversationRouting.step.targetRoleDefault")}
            />
            <PlainTextEditorField
              description={t("conversationRouting.step.metadataHelper", {
                max: THREAD_CONTROL_STEP_METADATA_MAX_LENGTH,
              })}
              includeBotFieldVariables
              label={t("conversationRouting.step.metadata")}
              name={`${parentName}.metadata`}
              showEmojiPicker={false}
            />
          </>
        )}
        <p className="text-muted-foreground text-xs">
          {t("conversationRouting.step.helper", { brand })}
        </p>
      </div>
    </BaseStepEditor>
  )
}

export default ThreadControlStepEditor
