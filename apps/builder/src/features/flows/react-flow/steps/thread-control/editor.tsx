"use client"

import { threadControlStepActions } from "@chatbotx.io/flow-config"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { ArrowRightLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTenantSettings } from "@/features/tenant/tenant-settings-provider"
import { BaseStepEditor } from "../base/editor"
import { THREAD_CONTROL_STEP_ACTION_KEYS } from "./labels"

const ThreadControlStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { name: brand } = useTenantSettings()

  return (
    <BaseStepEditor
      icon={ArrowRightLeftIcon}
      title={t("flows.actions.threadControl")}
    >
      <div className="flex w-[243px] flex-col gap-2">
        <RadioGroupField
          label={t("conversationRouting.step.action")}
          name={`${parentName}.action`}
          options={threadControlStepActions.options.map((action) => ({
            value: action,
            label: t(THREAD_CONTROL_STEP_ACTION_KEYS[action]),
          }))}
          required
        />
        <p className="text-muted-foreground text-xs">
          {t("conversationRouting.step.helper", { brand })}
        </p>
      </div>
    </BaseStepEditor>
  )
}

export default ThreadControlStepEditor
