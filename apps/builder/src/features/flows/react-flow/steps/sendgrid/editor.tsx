"use client"

import {
  type SendGridStepSchema,
  sendGridDefaultFn,
  sendGridStepSchema,
} from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightIcon, Loader2Icon, MailIcon, TrashIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useSendGridStore } from "@/features/integration-sendgrid/provider/sendgrid-store-context"
import { BaseStepEditor } from "../base/editor"

type SendGridStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const SendGridStepForm = memo(
  ({ parentName, onSuccess, onCancel }: SendGridStepFormProps) => {
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<SendGridStepSchema>({
      resolver: zodResolver(sendGridStepSchema),
      defaultValues: getParentValues(parentName) ?? sendGridDefaultFn(),
      mode: "onChange",
    })

    const {
      fields: mappingFields,
      remove,
      append,
    } = useFieldArray({
      control: form.control,
      name: "mergeFields" as const,
    })

    const listId = useWatch({
      control: form.control,
      name: "listId",
    })

    const lists = useSendGridStore((s) => s.lists)
    const fields = useSendGridStore((s) => s.fields)
    const loadingFields = useSendGridStore((s) => s.loadingFields)
    const error = useSendGridStore((s) => s.error)

    const fetchLists = useSendGridStore((s) => s.fetchLists)
    const fetchFields = useSendGridStore((s) => s.fetchFields)

    const lastAutoAppendedListId = useRef<string | null>(null)
    const isNewNode = useRef(!getParentValues(parentName)?.listId)

    const autoAppend = useCallback(() => {
      if (
        !listId ||
        fields.length === 0 ||
        !isNewNode.current ||
        lastAutoAppendedListId.current === listId
      ) {
        return
      }

      const currentMergeFields = form.getValues().mergeFields
      if (
        lastAutoAppendedListId.current === null &&
        currentMergeFields &&
        currentMergeFields.length > 0
      ) {
        lastAutoAppendedListId.current = listId
        return
      }

      for (const field of fields) {
        append({
          chatbotField: "",
          sendGridField: field.id,
        })
      }
      lastAutoAppendedListId.current = listId
    }, [listId, fields, append, form])

    useEffect(() => {
      if (chatbotId) {
        fetchLists(chatbotId)
        fetchFields(chatbotId)
      }
    }, [chatbotId, fetchLists, fetchFields])

    useEffect(() => {
      autoAppend()
    }, [autoAppend])

    const listOptions = useMemo(
      () => (lists ?? []).map((v) => ({ label: v.name, value: v.id })),
      [lists],
    )

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: SendGridStepSchema) => {
      setParentValue(parentName, data)
      onSuccess?.()
    }

    const t = useTranslations()

    return (
      <Form {...form}>
        <form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <span className="font-medium text-sm">
                {t("sendgrid.fields.list")}
              </span>
              <span className="self-start font-normal text-xxs">
                (optional)
              </span>
            </div>
            <ComboboxField
              contentClassName="w-[var(--radix-popover-trigger-width)]"
              label=""
              name="listId"
              options={listOptions}
              placeholder={t("sendgrid.fields.listPlaceholder")}
            />
          </div>

          <CustomFieldSelect
            includeReserved={true}
            label={t("sendgrid.fields.emailField")}
            name="emailField"
            required
            tooltip={t("sendgrid.fields.emailFieldTooltip")}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <span className="font-medium text-sm">
                {t("sendgrid.fields.phoneField")}
              </span>
              <span className="self-start font-normal text-xxs">
                ({t("sendgrid.fields.phoneFieldOptional")})
              </span>
            </div>
            <CustomFieldSelect
              includeReserved={true}
              label=""
              name="phoneField"
              placeholder="---"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <span className="font-medium text-sm">
                {t("sendgrid.fields.customFieldsMapping")}
              </span>
              <span className="self-start font-normal text-xxs">
                (optional)
              </span>
            </div>
            {loadingFields ? (
              <div className="flex items-center justify-center p-4">
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              mappingFields.map((field, index) => (
                <div className="flex items-center gap-2" key={field.id}>
                  <div className="flex-1">
                    <CustomFieldSelect
                      allowClear={true}
                      includeReserved={true}
                      label=""
                      name={`mergeFields.${index}.chatbotField`}
                      placeholder="---"
                    />
                  </div>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex h-10 w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-input bg-muted/50 px-3 py-2 text-muted-foreground text-sm">
                      {fields.find((f) => f.id === field.sendGridField)?.name ||
                        field.sendGridField}
                    </div>
                  </div>
                  <Button
                    className="h-8 w-8 p-0"
                    onClick={() => remove(index)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
            {error && !loadingFields && (
              <div className="text-destructive text-sm">{t(error)}</div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={!form.formState.isValid} size="sm" type="submit">
              {form.formState.isSubmitting && (
                <Loader2Icon className="animate-spin" />
              )}
              {t("actions.confirm")}
            </Button>
          </div>
        </form>
      </Form>
    )
  },
)
SendGridStepForm.displayName = "SendGridStepForm"

const SendGridStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
  }, [])

  const handleSuccess = useCallback(() => {
    setOpen(false)
  }, [])

  const handleCancel = useCallback(() => {
    setOpen(false)
  }, [])

  return (
    <BaseStepEditor icon={MailIcon} title={t("flows.actions.sendgrid")}>
      <div className="flex flex-col gap-3">
        <Dialog onOpenChange={handleOpenChange} open={open}>
          <DialogTrigger asChild>
            <div className="flex justify-center">
              <Button size="sm" variant="outline">
                {t("actions.edit")}
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("flows.actions.sendgrid")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <SendGridStepForm
              onCancel={handleCancel}
              onSuccess={handleSuccess}
              parentName={parentName}
            />
          </DialogContent>
        </Dialog>
      </div>
    </BaseStepEditor>
  )
}

export default SendGridStepEditor
