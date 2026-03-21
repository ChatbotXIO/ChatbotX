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
      { label: "Is", value: Operator.IS },
      { label: "Is Not", value: Operator.IS_NOT },
      { label: "Greater than or Equal to", value: Operator.GTE },
      { label: "Less than or Equal to", value: Operator.LTE },
      { label: "Greater than", value: Operator.GT },
      { label: "Less than", value: Operator.LT },
      { label: "Contains", value: Operator.CONTAINS },
      { label: "Not Contains", value: Operator.NOT_CONTAINS },
      { label: "Starts With", value: Operator.STARTS_WITH },
      { label: "Ends With", value: Operator.ENDS_WITH },
    ],
    [],
  )

  return (
    <SelectField
      label={label}
      name={name}
      options={operators}
      placeholder="Please select"
    />
  )
}
