"use client"

import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { SpreadsheetDialog } from "@/features/flows/react-flow/steps/spreadsheet/components/dialog"
import { SpreadsheetCustomFieldMapping } from "../spreadsheet/custom-field-mapping"
import { SpreadsheetColumnFilter } from "../spreadsheet/spreadsheet-column-filter"
import { SpreadsheetSelect } from "../spreadsheet/spreadsheet-select"
import { WorksheetSelect } from "../spreadsheet/worksheet-select"
import { spreadsheetGetRandomRowSchema } from "./schema"

type SpreadsheetGetRandomRowEditorProps = {
  parentName: string
}

export const SpreadsheetGetRandomRowEditor = ({
  parentName,
}: SpreadsheetGetRandomRowEditorProps) => {
  const { getValues, setValue: setValueParent } = useFormContext()
  const [open, setOpen] = useState(false)

  const form = useForm({
    resolver: zodResolver(spreadsheetGetRandomRowSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "all",
    shouldUseNativeValidation: true,
  })

  const { control, resetField, setValue } = form

  const spreadsheetId = useWatch({
    control,
    name: "spreadsheetId",
  })
  const sheetName = useWatch({
    control,
    name: "sheetName",
  })

  const onChangeSpreadsheet = useCallback(() => {
    resetField("map")
    resetField("sheetName")
  }, [resetField])

  const onChangeWorksheet = useCallback(
    (value: string) => {
      setValue("sheetName", value)
      resetField("map")
    },
    [setValue, resetField],
  )

  const onSubmit = useCallback(() => {
    setValueParent(parentName, form.getValues())
    setOpen(false)
  }, [setValueParent, parentName, form.getValues])

  return (
    <Form {...form}>
      <SpreadsheetDialog
        name="Flows.Spreadsheets.GetRandomRow"
        onOpenChange={(val: boolean) => setOpen(val)}
        onSubmit={onSubmit}
        open={open}
      >
        <div className="flex flex-col gap-4">
          <SpreadsheetSelect
            name="spreadsheetId"
            onChange={onChangeSpreadsheet}
          />
          {spreadsheetId && <WorksheetSelect onChange={onChangeWorksheet} />}

          {spreadsheetId && sheetName && <SpreadsheetColumnFilter />}
          {spreadsheetId && sheetName && (
            <SpreadsheetCustomFieldMapping type="get" />
          )}
        </div>
      </SpreadsheetDialog>
    </Form>
  )
}
