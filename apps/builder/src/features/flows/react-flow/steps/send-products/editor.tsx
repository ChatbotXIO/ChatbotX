"use client"

import type { SendProductsStepSchema } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { ShoppingCartIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { SendProductsDialog } from "./components/send-products-dialog"
import { SendProductsSummary } from "./components/send-products-summary"
import { type SendProductsFormValues, toStepFields } from "./lib/form"

type SendProductsStepEditorProps = {
  parentName: string
}

const SendProductsStepEditor = ({
  parentName,
}: SendProductsStepEditorProps) => {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const step = useWatch({ control, name: parentName }) as SendProductsStepSchema
  const channelValue = useWatch({ control, name: "beforeStep.channel" })
  const channel = channelTypes.safeParse(channelValue)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleSave = (values: SendProductsFormValues) => {
    const fields = toStepFields(values)
    setValue(
      parentName,
      { ...step, ...fields },
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    )
  }

  return (
    <div className="overflow-hidden rounded-lg bg-slate-200 px-3 py-2 dark:bg-neutral-900">
      <Button
        className="h-auto w-full flex-col gap-0.5 py-2"
        onClick={() => setIsDialogOpen(true)}
        type="button"
        variant="outline"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <ShoppingCartIcon aria-hidden className="size-4 text-amber-500" />
          {t("flows.actions.sendProducts")}
        </span>
        <span className="font-normal text-muted-foreground text-xs">
          <SendProductsSummary step={step} />
        </span>
      </Button>
      {channel.success && (
        <SendProductsDialog
          channel={channel.data}
          onOpenChange={setIsDialogOpen}
          onSave={handleSave}
          open={isDialogOpen}
          step={step}
        />
      )}
    </div>
  )
}

export default SendProductsStepEditor
