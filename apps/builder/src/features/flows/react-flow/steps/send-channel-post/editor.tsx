"use client"

import type { SendChannelPostStepSchema } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { NewspaperIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ChannelPostDialog } from "./components/channel-post-dialog"
import { ChannelPostSummary } from "./components/channel-post-summary"

type SendChannelPostStepEditorProps = {
  parentName: string
}

const SendChannelPostStepEditor = ({
  parentName,
}: SendChannelPostStepEditorProps) => {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const step = useWatch({
    control,
    name: parentName,
  }) as SendChannelPostStepSchema
  const nodeChannel = useWatch({ control, name: "beforeStep.channel" })
  const [open, setOpen] = useState(false)

  const handlePick = (channelPostId: string) => {
    setValue(
      parentName,
      { ...step, channelPostId },
      { shouldDirty: true, shouldValidate: true },
    )
  }

  return (
    <div className="overflow-hidden rounded-lg bg-slate-200 px-3 py-2 dark:bg-neutral-900">
      <Button
        className="h-auto w-full flex-col items-stretch gap-1 py-2"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <NewspaperIcon aria-hidden className="size-4 text-pink-500" />
          {t("flows.actions.sendChannelPost")}
        </span>
        <ChannelPostSummary channelPostId={step.channelPostId} />
      </Button>
      <ChannelPostDialog
        nodeChannel={typeof nodeChannel === "string" ? nodeChannel : ""}
        onOpenChange={setOpen}
        onPick={handlePick}
        open={open}
        selectedPostId={step.channelPostId || null}
      />
    </div>
  )
}

export default SendChannelPostStepEditor
