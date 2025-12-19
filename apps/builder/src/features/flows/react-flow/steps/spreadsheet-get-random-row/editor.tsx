"use client"

import { spreadsheetGetRandomRowSchema } from "@aha.chat/flow-config"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { SpreadsheetDialog } from "@/features/flows/react-flow/steps/spreadsheet/components/dialog"
import { SpreadsheetColumnFilter } from "../spreadsheet/components/spreadsheet-column-filter"
import { SpreadsheetSelect } from "../spreadsheet/components/spreadsheet-select"
import { SpreadsheetCustomFieldMapping } from "../spreadsheet/custom-field-mapping"
import { WorksheetSelect } from "../spreadsheet/worksheet-select"

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

  const { control, resetField } = form

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

  const onSubmit = useCallback(() => {
    setValueParent(parentName, form.getValues())
    setOpen(false)
  }, [setValueParent, parentName, form.getValues, form])

  return (
    <Form {...form}>
      <SpreadsheetDialog
        name="flows.actions.spreadsheetGetRandomRow"
        onOpenChange={(val: boolean) => setOpen(val)}
        onSubmit={onSubmit}
        open={open}
      >
        <div className="flex flex-col gap-4">
          <SpreadsheetSelect
            name="spreadsheetId"
            required
            triggerValueChange={onChangeSpreadsheet}
          />
          {spreadsheetId && (
            <WorksheetSelect name="sheetName" spreadsheetId={spreadsheetId} />
          )}

          {spreadsheetId && sheetName && <SpreadsheetColumnFilter />}
          {spreadsheetId && sheetName && (
            <SpreadsheetCustomFieldMapping type="get" />
          )}
        </div>
      </SpreadsheetDialog>
    </Form>
  )
}
