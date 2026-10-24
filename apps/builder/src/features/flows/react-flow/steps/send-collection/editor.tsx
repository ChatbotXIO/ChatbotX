"use client"

import type { SendCollectionStepSchema } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { GalleryHorizontalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { CollectionDialog } from "./components/collection-dialog"
import { CollectionSummary } from "./components/collection-summary"

const SendCollectionStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const step = useWatch({
    control,
    name: parentName,
  }) as SendCollectionStepSchema
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg bg-slate-200 px-3 py-2 dark:bg-neutral-900">
      <Button
        className="h-auto w-full flex-col gap-0.5 py-2"
        onClick={() => setIsDialogOpen(true)}
        type="button"
        variant="outline"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <GalleryHorizontalIcon
            aria-hidden
            className="size-4 text-amber-500"
          />
          {t("flows.actions.sendCollection")}
        </span>
        <span className="font-normal text-muted-foreground text-xs">
          <CollectionSummary step={step} />
        </span>
      </Button>
      <CollectionDialog
        onOpenChange={setIsDialogOpen}
        onSave={(values) =>
          setValue(
            parentName,
            { ...step, ...values },
            { shouldDirty: true, shouldValidate: true },
          )
        }
        open={isDialogOpen}
        step={step}
      />
    </div>
  )
}

export default SendCollectionStepEditor
