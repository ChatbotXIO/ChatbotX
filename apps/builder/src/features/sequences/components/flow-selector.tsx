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
        onChange(formData.flowId.toString())
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
