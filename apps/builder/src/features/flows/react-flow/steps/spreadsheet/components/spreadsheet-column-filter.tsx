"use client"

import { FilterMode, Operator } from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { TrashIcon } from "lucide-react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { SpreadsheetOperatorSelect } from "../spreadsheet-operator-select"
import { WorksheetColumnSelect } from "../worksheet-column-select"

// interface SpreadsheetColumnFilterProps {
//   spreadsheetId: string
//   sheetName: string
//   parentName: string
// }

export const SpreadsheetColumnFilter = ({
  parentName,
}: {
  parentName?: string
}) => {
  const { control } = useFormContext()
  const getFieldName = (field: string) => {
    if (!parentName) {
      return field
    }
    return `${parentName}.${field}`
  }

  const { fields, append, remove } = useFieldArray({
    control,
    name: getFieldName("lookup.conditions"),
  })

  // const mode = useWatch({
  //   control,
  //   name: "lookup.mode",
  //   defaultValue: FilterMode.AND,
  // })

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex-1 text-nowrap">Lookup Columns:</span>
        <SelectField
          defaultValue={FilterMode.AND}
          name={getFieldName("lookup.mode")}
          options={[
            { label: "AND", value: FilterMode.AND },
            { label: "OR", value: FilterMode.OR },
          ]}
        />
      </div>

      {fields.map((_field, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: wip
        <div className="mb-2 flex items-center gap-2" key={idx}>
          <WorksheetColumnSelect
            label=""
            name={`lookup.conditions.${idx}.column`}
            parentName={parentName}
          />
          <SpreadsheetOperatorSelect
            label=""
            name={getFieldName(`lookup.conditions.${idx}.operator`)}
          />
          <InputField
            name={getFieldName(`lookup.conditions.${idx}.value`)}
            placeholder="Value"
          />
          <Button onClick={() => remove(idx)} type="button" variant="ghost">
            <TrashIcon size={20} />
          </Button>
        </div>
      ))}

      <Button
        onClick={() => append({ column: "", operator: Operator.IS, value: "" })}
        type="button"
        variant="secondary"
      >
        + Filter
      </Button>
    </div>
  )
}
