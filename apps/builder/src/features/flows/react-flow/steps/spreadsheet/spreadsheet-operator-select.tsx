"use client"

import { Operator } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useMemo } from "react"

type ISpreadsheetOperatorSelectProps = {
  name: string
  label?: string
}

export const SpreadsheetOperatorSelect = ({
  name,
  label = "",
}: ISpreadsheetOperatorSelectProps) => {
  const operators = useMemo(
    () => [
      { label: "É", value: Operator.IS },
      { label: "Não é", value: Operator.IS_NOT },
      { label: "Maior ou igual a", value: Operator.GTE },
      { label: "Menor ou igual a", value: Operator.LTE },
      { label: "Maior que", value: Operator.GT },
      { label: "Menor que", value: Operator.LT },
      { label: "Contém", value: Operator.CONTAINS },
      { label: "Não contém", value: Operator.NOT_CONTAINS },
      { label: "Começa com", value: Operator.STARTS_WITH },
      { label: "Termina com", value: Operator.ENDS_WITH },
    ],
    [],
  )

  return (
    <SelectField
      label={label}
      name={name}
      options={operators}
      placeholder="Por favor selecione"
    />
  )
}
