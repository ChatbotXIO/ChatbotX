"use client"

import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import {
  type FieldPath,
  type FieldValues,
  useFormContext,
  useWatch,
} from "react-hook-form"

type MarkReadOnOutboundFieldProps = {
  name?: FieldPath<FieldValues>
}

export function MarkReadOnOutboundField({
  name = "markReadOnOutbound",
}: MarkReadOnOutboundFieldProps) {
  const t = useTranslations()
  const form = useFormContext()
  const enabled = Boolean(useWatch({ control: form.control, name }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inboxes.markReadOnOutbound.label")}</CardTitle>
        <CardDescription>
          {t("inboxes.markReadOnOutbound.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SwitchField
          label={
            enabled
              ? t("inboxes.markReadOnOutbound.enabled")
              : t("inboxes.markReadOnOutbound.disabled")
          }
          name={name}
          required
        />
      </CardContent>
    </Card>
  )
}
