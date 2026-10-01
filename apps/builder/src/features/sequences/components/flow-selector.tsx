"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"

type FlowSelectorSimpleProps = {
  value: string
  onChange: (value: string) => void
  showError?: boolean
  /** Overrides the default compact width (e.g. a full-width settings row). */
  className?: string
  /** Overrides the default "Select Flow" placeholder shown while empty. */
  placeholder?: string
}

export function FlowSelectorSimple({
  value,
  onChange,
  showError,
  className,
  placeholder,
}: FlowSelectorSimpleProps) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()

  const form = useForm({
    defaultValues: {
      flowId: value,
    },
  })

  useEffect(() => {
    form.reset({ flowId: value })
  }, [value, form])

  useEffect(() => {
    const subscription = form.watch((formData) => {
      if (formData.flowId && formData.flowId !== value) {
        onChange(formData.flowId.toString())
      }
    })
    return () => subscription.unsubscribe()
  }, [form, onChange, value])

  return (
    <Form {...form}>
      <ComboboxField
        className={cn(
          className ?? "max-w-32 flex-1",
          showError && "border-destructive",
        )}
        emptyText={t("actions.noRecordFound")}
        name="flowId"
        options={flowOptions}
        placeholder={placeholder ?? t("sequences.selectFlow")}
      />
    </Form>
  )
}
