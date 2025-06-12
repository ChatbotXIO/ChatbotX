"use client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { CustomFieldType } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { T, useTranslate } from "@tolgee/react"
import { ArrowRightIcon, BracesIcon, XIcon } from "lucide-react"
import React from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"

interface getDataFromJsonEditorProps {
  parentName: string
}

export const GetDataFromJsonEditor = ({
  parentName,
}: getDataFromJsonEditorProps) => {
  const { t } = useTranslate()
  const [open, setOpen] = React.useState(false)

  const { setValue: setValueOriginEditor, getValues: getValuesOriginEditor } =
    useFormContext()
  const schema: GetDataFromJsonSchema = getValuesOriginEditor(parentName)

  const form = useForm<GetDataFromJsonSchema>({
    resolver: zodResolver(getDataFromJsonSchema),
    defaultValues: schema,
    mode: "onChange",
  })

  const { control, getValues, formState } = form
  const { fields, append, remove } = useFieldArray({
    control,
    name: "responses",
  })

  const onSave = () => {
    setValueOriginEditor(parentName, getValues())
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md bg-slate-200 p-2 border-2 border-transparent transition-all ease-in hover:border-blue-500 hover:cursor-pointer hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <BracesIcon size={20} className="text-yellow-500" />
            <T keyName="flows.ActionType.GetDataFromJson" />
          </div>
        </div>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("flows.ActionType.GetDataFromJson")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <div className="flex flex-col gap-4">
            <CustomFieldSelect
              name="fromCustomFieldId"
              label={t("flows.GetDataFromJson.JsonData")}
              customFieldType={[
                CustomFieldType.SHORTTEXT,
                CustomFieldType.LONGTEXT,
              ]}
            />

            <CustomFieldSelect
              name="responses"
              label="Save response to a custom field"
              allowCreate={true}
            >
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex-1">
                    <FormField
                      control={control}
                      name={`responses.${index}.path`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="JSON path" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <ArrowRightIcon />
                  <div className="flex-1">
                    <CustomFieldSelect
                      name={`responses.${index}.customFieldId`}
                      label=""
                    />
                  </div>
                  {fields.length > 1 && (
                    <Button variant="ghost" onClick={() => remove(index)}>
                      <XIcon size={18} />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => append(responseDataFromJsonDefaultValue())}
              >
                {t("common.addNew")}
              </Button>
            </CustomFieldSelect>
          </div>
        </Form>

        <DialogFooter className="flex items-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>

          <Button
            type="button"
            size="sm"
            disabled={!formState.isValid}
            onClick={onSave}
          >
            <T keyName="common.continue" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
