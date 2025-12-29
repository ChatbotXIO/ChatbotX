"use client"

import {
  type SpreadsheetClearRowSchema,
  spreadsheetClearRowSchema,
} from "@aha.chat/flow-config"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { SpreadsheetDialog } from "../spreadsheet/components/dialog"
import { SpreadsheetColumnFilter } from "../spreadsheet/components/spreadsheet-column-filter"
import { SpreadsheetSelect } from "../spreadsheet/components/spreadsheet-select"
import { WorksheetSelect } from "../spreadsheet/worksheet-select"

export const SpreadsheetClearRowEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const [open, setOpen] = useState(false)
  const { getValues, setValue: setValueParent } = useFormContext()

  const form = useForm<SpreadsheetClearRowSchema>({
    resolver: zodResolver(spreadsheetClearRowSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const spreadsheetId = useWatch({ name: "spreadsheetId" })
  const sheetName = useWatch({ name: "sheetName" })

  const onSubmit = useCallback(() => {
    setValueParent(parentName, form.getValues())
    setOpen(false)
  }, [setValueParent, parentName, form.getValues, form])

  return (
    <Form {...form}>
      <SpreadsheetDialog
        name="flows.actions.spreadsheetClearRow"
        onOpenChange={(val: boolean) => setOpen(val)}
        onSubmit={onSubmit}
        open={open}
      >
        <div className="flex flex-col gap-4">
          <SpreadsheetSelect label="Spreadsheet" name="spreadsheetId" />

          {spreadsheetId && (
            <WorksheetSelect name="sheetName" spreadsheetId={spreadsheetId} />
          )}

          {spreadsheetId && sheetName && <SpreadsheetColumnFilter />}
        </div>
      </SpreadsheetDialog>
    </Form>
  )
}
