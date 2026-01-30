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
import { useEffect, useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { toast } from "sonner"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useMailchimpStore } from "@/features/integration-mailchimp/provider/mailchimp-store-context"
import { BaseStepEditor } from "../base/editor"

type MailchimpAddMemberStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const MailchimpAddMemberStepForm = ({
  parentName,
  onSuccess,
  onCancel,
}: MailchimpAddMemberStepFormProps) => {
  const t = useTranslations()
  const params = useParams<{ chatbotId: string }>()
  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const form = useForm<MailchimpAddMemberSchema>({
    resolver: zodResolver(mailchimpAddMemberStepSchema),
    defaultValues: mailchimpAddMemberDefaultFn(),
    mode: "onChange",
  })

  const { fields, remove } = useFieldArray({
    control: form.control,
    name: "mergeFields",
  })

  useEffect(() => {
    const parentValues = getParentValues(parentName)
    if (parentValues) {
      form.reset(parentValues)
    }
  }, [form, getParentValues, parentName])

  const listId = useWatch({
    control: form.control,
    name: "listId",
  })

  const { lists, tagsByListId, fetchLists, fetchTags, error } =
    useMailchimpStore((s) => s)

  useEffect(() => {
    if (error) {
      toast.error(t(error))
    }
  }, [error, t])

  useEffect(() => {
    fetchLists(params.chatbotId)
  }, [fetchLists, params.chatbotId])

  useEffect(() => {
    if (listId) {
      fetchTags(params.chatbotId, listId)
    }
  }, [listId, fetchTags, params.chatbotId])

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
          portal={true}
          required
        />

        {listId && (
          <>
            <CustomFieldSelect
              includeReserved={true}
              label={t("mailchimp.fields.emailField")}
              name="emailField"
              portal={true}
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
                      portal={true}
                    />
                  </div>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <InputField
                      name={`mergeFields.${index}.mailchimpTag`}
                      placeholder="Mailchimp Tag"
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
}

const MailchimpAddMemberStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.mailchimpAddMember")}
    >
      <div className="flex flex-col gap-3">
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger asChild>
            <div className="flex justify-center">
              <Button size="sm" variant="outline">
                {t("actions.edit")}
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle>{t("flows.actions.mailchimpAddMember")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6">
              <MailchimpAddMemberStepForm
                onCancel={() => setOpen(false)}
                onSuccess={() => setOpen(false)}
                parentName={parentName}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </BaseStepEditor>
  )
}

export default MailchimpAddMemberStepEditor
