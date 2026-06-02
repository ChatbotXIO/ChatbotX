"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Pencil } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useWhatsappInboxOptions } from "@/features/inboxes/provider/inbox-hook"
import { useWhatsappFlow } from "../../stores/whatsapp-flow-store-provider"
import { FlowDialog } from "./components/flow-dialog"

type WhatsappFlowStepEditorProps = {
  parentName: string
}

const WhatsappFlowStepEditor = ({
  parentName,
}: WhatsappFlowStepEditorProps) => {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const buttonLabel = useWatch({
    control,
    name: `${parentName}.buttons.0.label`,
  }) as string
  const integrationInboxId = useWatch({
    control,
    name: `${parentName}.inboxId`,
  }) as string | undefined

  const whatsappInboxOptions = useWhatsappInboxOptions()
  const whatsappFlows = useWhatsappFlow((s) => s.whatsappFlows)
  const prevInboxIdRef = useRef<string | undefined>(undefined)

  const [dialogOpen, setDialogOpen] = useState(false)

  const flowOptions = useMemo(
    () =>
      whatsappFlows
        .filter(
          (flow) =>
            flow.status === "PUBLISHED" &&
            flow.integrationWhatsapp?.inboxId === integrationInboxId,
        )
        .map((flow) => ({ value: flow.id, label: flow.name })),
    [whatsappFlows, integrationInboxId],
  )

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true)
  }, [])

  const handleFlowSelected = useCallback(() => {
    setValue(`${parentName}.flow.startScreenId`, null)
    setValue(`${parentName}.flow.fieldMappings`, [])
  }, [parentName, setValue])

  useEffect(() => {
    if (
      prevInboxIdRef.current !== undefined &&
      prevInboxIdRef.current !== integrationInboxId
    ) {
      setValue(`${parentName}.flow.id`, null)
      setValue(`${parentName}.flow.startScreenId`, null)
      setValue(`${parentName}.flow.fieldMappings`, [])
    }
    prevInboxIdRef.current = integrationInboxId
  }, [integrationInboxId, parentName, setValue])

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="space-y-3 bg-slate-100 px-4 py-2 dark:bg-neutral-900">
        <ComboboxField
          name={`${parentName}.inboxId`}
          options={whatsappInboxOptions}
          required={true}
        />

        <SelectField
          name={`${parentName}.flow.id`}
          options={flowOptions}
          placeholder={t("flows.whatsappFlow.selectFlowPlaceholder")}
          triggerValueChange={handleFlowSelected}
        />
      </div>

      <div className="space-y-3 bg-secondary px-4 py-2">
        <TiptapEditorField name={`${parentName}.text`} />
      </div>

      <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
        <Button
          className="w-full items-center justify-between"
          onClick={handleOpenDialog}
          type="button"
          variant="secondary"
        >
          <span className="flex-1 truncate text-center">{buttonLabel}</span>
          <Pencil className="size-4" />
        </Button>
      </div>

      <FlowDialog
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        parentName={parentName}
      />
    </div>
  )
}

export default WhatsappFlowStepEditor
