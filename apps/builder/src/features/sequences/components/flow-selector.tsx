"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { Form } from "@aha.chat/ui/components/ui/form"
import { cn } from "@aha.chat/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"

type FlowSelectorSimpleProps = {
  value: string
  onChange: (value: string) => void
  showError?: boolean
}

export function FlowSelectorSimple({
  value,
  onChange,
  showError,
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
        onChange(formData.flowId)
      }
    })
    return () => subscription.unsubscribe()
  }, [form, onChange, value])

  return (
    <Form {...form}>
      <ComboboxField
        className={cn("flex-1", showError && "border-destructive")}
        name="flowId"
        options={flowOptions}
        placeholder={t("sequences.selectFlow")}
      />
    </Form>
  )
}
