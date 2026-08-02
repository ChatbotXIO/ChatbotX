"use client"

import { spreadsheetUpdateRowSchema } from "@chatbotx.io/flow-config"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { SpreadsheetDialog } from "@/features/flows/react-flow/steps/spreadsheet/components/dialog"
import { useSpreadsheetDialogOpen } from "@/features/flows/react-flow/steps/spreadsheet/components/spreadsheet-dialog-context"
import { SpreadsheetColumnFilter } from "../spreadsheet/components/spreadsheet-column-filter"
import { SpreadsheetSelect } from "../spreadsheet/components/spreadsheet-select"
import { SpreadsheetCustomFieldMapping } from "../spreadsheet/custom-field-mapping"
import { WorksheetSelect } from "../spreadsheet/worksheet-select"

type SpreadsheetUpdateRowEditorProps = {
  parentName: string
}

export const SpreadsheetUpdateRowEditor = ({
  parentName,
}: SpreadsheetUpdateRowEditorProps) => {
  const { getValues, setValue: setValueParent } = useFormContext()
  const [open, setOpen] = useSpreadsheetDialogOpen(parentName)

  const form = useForm({
    resolver: zodResolver(spreadsheetUpdateRowSchema),
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
  }, [setValueParent, parentName, form.getValues, form, setOpen])

  return (
    <Form {...form}>
      <SpreadsheetDialog
        name={`flows.actions.${getValues(parentName).stepType}`}
        onOpenChange={(val: boolean) => setOpen(val)}
        onSubmit={onSubmit}
        open={open}
      >
        <div className="flex flex-col gap-4">
          <SpreadsheetSelect
            name="spreadsheetId"
            triggerValueChange={onChangeSpreadsheet}
          />
          {spreadsheetId && (
            <WorksheetSelect name="sheetName" spreadsheetId={spreadsheetId} />
          )}
          {spreadsheetId && sheetName && <SpreadsheetColumnFilter />}
          {spreadsheetId && sheetName && (
            <SpreadsheetCustomFieldMapping direction="contactToSheet" />
          )}
        </div>
      </SpreadsheetDialog>
    </Form>
  )
}
