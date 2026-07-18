"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import type { ContactFilterCondition } from "../schemas"
import {
  ContactFilterConditionDialog,
  getResetDraftForField,
} from "./contact-filter-condition-dialog"
import type {
  ConditionOption,
  ContactFilterConditionFormDraft,
  FieldConfig,
} from "./contact-filter-config"

type ContactFilterConditionFormProps = {
  onAdd: (data: ContactFilterCondition) => void
  configs: FieldConfig[]
  conditionOptions: ConditionOption[]
  enableVariables?: boolean
}

export const ContactFilterConditionForm = ({
  onAdd,
  configs,
  conditionOptions,
  enableVariables = false,
}: ContactFilterConditionFormProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const getInitialDraft = useCallback((): ContactFilterConditionFormDraft => {
    const firstConfig = configs[0]
    const resetDraft = getResetDraftForField(firstConfig, conditionOptions)

    return {
      field: firstConfig?.name ?? "",
      ...resetDraft,
    }
  }, [configs, conditionOptions])

  const title = t("actions.addFeature", {
    feature: t("fields.condition.label"),
  })

  return (
    <>
      <Button
        className="h-12 w-full justify-center rounded-md border border-dashed bg-background/60 text-muted-foreground hover:bg-primary/5 hover:text-primary"
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon size={16} />
        {title}
      </Button>

      <ContactFilterConditionDialog
        conditionOptions={conditionOptions}
        configs={configs}
        enableVariables={enableVariables}
        initialDraft={getInitialDraft()}
        key={String(open)}
        onOpenChange={setOpen}
        onSubmit={onAdd}
        open={open}
        title={title}
      />
    </>
  )
}
