"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { XIcon } from "lucide-react"
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

type ClearableFlowSelectorProps = {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  /** Accessible name of the clear button. */
  clearLabel: string
}

/** A full-width flow selector with a clear (X) button; `null` means no flow. */
export function ClearableFlowSelector({
  value,
  onChange,
  placeholder,
  clearLabel,
}: ClearableFlowSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <FlowSelectorSimple
          className="w-full"
          onChange={(next) => onChange(next || null)}
          placeholder={placeholder}
          value={value ?? ""}
        />
      </div>
      {value && (
        <Button
          aria-label={clearLabel}
          onClick={() => onChange(null)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden />
        </Button>
      )}
    </div>
  )
}
