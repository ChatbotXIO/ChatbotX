"use client"

import { Operator } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

type ISpreadsheetOperatorSelectProps = {
  name: string
  label?: string
}

export const SpreadsheetOperatorSelect = ({
  name,
  label = "",
}: ISpreadsheetOperatorSelectProps) => {
  const t = useTranslations()

  const operators = useMemo(
    () => [
      { label: t("fields.operator.is"), value: Operator.IS },
      { label: t("fields.operator.isNot"), value: Operator.IS_NOT },
      { label: t("fields.operator.gte"), value: Operator.GTE },
      { label: t("fields.operator.lte"), value: Operator.LTE },
      { label: t("fields.operator.gt"), value: Operator.GT },
      { label: t("fields.operator.lt"), value: Operator.LT },
      { label: t("fields.operator.contains"), value: Operator.CONTAINS },
      {
        label: t("fields.operator.notContains"),
        value: Operator.NOT_CONTAINS,
      },
      { label: t("fields.operator.startsWith"), value: Operator.STARTS_WITH },
      { label: t("fields.operator.endsWith"), value: Operator.ENDS_WITH },
    ],
    [t],
  )

  return (
    <SelectField
      label={label}
      name={name}
      options={operators}
      placeholder={t("actions.pleaseSelect")}
    />
  )
}
