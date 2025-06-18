"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SheetIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { SpreadsheetColumnFilter } from "../spreadsheet/components/spreadsheet-column-filter"
import { SpreadsheetSelect } from "../spreadsheet/components/spreadsheet-select"
import { WorksheetSelect } from "../spreadsheet/worksheet-select"
import {
  type SpreadsheetClearRowSchema,
  spreadsheetClearRowSchema,
} from "./schema"

export default function SpreadsheetClearRowEditor({
  parentName,
}: {
  parentName: string
}) {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={SheetIcon}
      title={t("flows.StepType.SpreadsheetClearRow")}
    >
      <SpreadsheetClearRowDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function SpreadsheetClearRowDialog({ parentName }: { parentName: string }) {
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<SpreadsheetClearRowSchema>({
    resolver: zodResolver(spreadsheetClearRowSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const spreadsheetId = form.watch("spreadsheetId")
  const sheetName = form.watch("sheetName")

  const onSubmit = (data: SpreadsheetClearRowSchema) => {
    setValue(`${parentName}.spreadsheetId`, data.spreadsheetId)
    setValue(`${parentName}.sheetName`, data.sheetName)
    setValue(`${parentName}.lookup`, data.lookup)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" variant="outline">
            Edit
          </Button>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Spreadsheet Clear Row</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SpreadsheetSelect label="Spreadsheet" name="spreadsheetId" />

            {spreadsheetId && (
              <WorksheetSelect name="sheetName" spreadsheetId={spreadsheetId} />
            )}

            {spreadsheetId && sheetName && (
              <SpreadsheetColumnFilter
              // spreadsheetId={spreadsheetId}
              // sheetName={sheetName}
              />
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
