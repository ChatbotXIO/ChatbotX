"use client"

import {
  type MailchimpAddMemberSchema,
  mailchimpAddMemberDefaultFn,
  mailchimpAddMemberStepSchema,
} from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
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
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useMailchimpStore } from "@/features/integration-mailchimp/provider/mailchimp-store-context"
import { BaseStepEditor } from "../base/editor"

type MailchimpAddMemberStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const MailchimpAddMemberStepForm = memo(
  ({ parentName, onSuccess, onCancel }: MailchimpAddMemberStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<MailchimpAddMemberSchema>({
      resolver: zodResolver(mailchimpAddMemberStepSchema),
      defaultValues:
        getParentValues(parentName) ?? mailchimpAddMemberDefaultFn(),
      mode: "onChange",
    })

    const { fields, remove, replace } = useFieldArray({
      control: form.control,
      name: "mergeFields",
    })

    const listId = useWatch({
      control: form.control,
      name: "listId",
    })

    const lists = useMailchimpStore((s) => s.lists)
    const tagsByListId = useMailchimpStore((s) => s.tagsByListId)
    const mergeFieldsByListId = useMailchimpStore((s) => s.mergeFieldsByListId)
    const fetchLists = useMailchimpStore((s) => s.fetchLists)
    const fetchTags = useMailchimpStore((s) => s.fetchTags)
    const fetchMergeFields = useMailchimpStore((s) => s.fetchMergeFields)

    useEffect(() => {
      if (chatbotId) {
        fetchLists(chatbotId)
      }
    }, [fetchLists, chatbotId])

    useEffect(() => {
      if (listId && chatbotId) {
        fetchTags(chatbotId, listId)
        fetchMergeFields(chatbotId, listId)
      }
    }, [listId, fetchTags, fetchMergeFields, chatbotId])

    useEffect(() => {
      const availableMergeFields = mergeFieldsByListId[listId]
      if (!availableMergeFields || availableMergeFields.length === 0) {
        return
      }

      const currentMergeFields = form.getValues("mergeFields")

      if (currentMergeFields.length === 0) {
        replace(
          availableMergeFields.map((f) => ({
            chatbotField: "",
            mailchimpTag: f.tag,
            mailchimpName: f.name,
            mailchimpType: f.type,
          })),
        )
        return
      }

      const nameToFieldMap = new Map(
        currentMergeFields
          .filter((f) => f.mailchimpName && f.chatbotField)
          .map((f) => [f.mailchimpName, f.chatbotField]),
      )

      const updatedFields = availableMergeFields.map((af) => {
        const existingChatbotField = nameToFieldMap.get(af.name) || ""
        return {
          chatbotField: existingChatbotField,
          mailchimpTag: af.tag,
          mailchimpName: af.name,
          mailchimpType: af.type,
        }
      })

      replace(updatedFields)
    }, [listId, mergeFieldsByListId, form, replace])

    const listOptions = useMemo(
      () => (lists ?? []).map((v) => ({ label: v.name, value: v.id })),
      [lists],
    )

    const tagOptions = useMemo(
      () =>
        (tagsByListId[listId] ?? []).map((v) => ({
          label: v.name,
          value: v.name,
        })),
      [tagsByListId, listId],
    )

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: MailchimpAddMemberSchema) => {
      setParentValue(parentName, data)
      onSuccess?.()
    }

    return (
      <Form {...form}>
        <form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <ComboboxField
            label={t("mailchimp.fields.list")}
            name="listId"
            options={listOptions}
            placeholder={t("mailchimp.fields.listPlaceholder")}
            required
          />

          {listId && (
            <>
              <CustomFieldSelect
                includeReserved={true}
                label={t("mailchimp.fields.emailField")}
                name="emailField"
                required
                tooltip={t("mailchimp.fields.emailFieldTooltip")}
              />

              <SwitchField
                description={t("mailchimp.fields.doubleOptInTooltip")}
                label={t("mailchimp.fields.doubleOptIn")}
                name="doubleOptIn"
              />

              <MultiSelectField
                label={t("mailchimp.fields.tags")}
                name="tags"
                options={tagOptions}
                placeholder={t("mailchimp.fields.tagsPlaceholder")}
              />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm">
                      {t("mailchimp.fields.customFieldsMapping")}
                    </span>
                    <span className="self-start font-normal text-xxs">
                      (optional)
                    </span>
                  </div>
                </div>
                {fields.map((field, index) => (
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
                      <InputField
                        disabled
                        name={`mergeFields.${index}.mailchimpName`}
                      />
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
                ))}
              </div>
            </>
          )}

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
MailchimpAddMemberStepForm.displayName = "MailchimpAddMemberStepForm"

const MailchimpAddMemberStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
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
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.mailchimpAddMember")}
    >
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
              <DialogTitle>{t("flows.actions.mailchimpAddMember")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <MailchimpAddMemberStepForm
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

export default MailchimpAddMemberStepEditor
