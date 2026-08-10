"use client"

import {
  channelTypes,
  contactImportFields,
  importTypes,
  uploadTypes,
} from "@chatbotx.io/database/partials"
import { matchContactImportHeaders } from "@chatbotx.io/imports"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  ArrowRightIcon,
  DownloadIcon,
  HistoryIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { toast } from "sonner"
import { importContactsAction } from "@/features/contacts/actions/import-contacts.action"
import { importContactsRequest } from "@/features/contacts/schemas/contact-import"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { ImportDropzone } from "@/features/import/components/import-dropzone"
import {
  useConfiguredInboxTypeOptions,
  useInboxOptionsByChannel,
} from "@/features/inboxes/provider/inbox-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { getBrowserTimezone } from "../contact-filter/lib/timezone"

export function ImportContactsForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const [fileId, setFileId] = useState("")
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [timezone, setTimezone] = useState("")
  const hasFile = fileId !== ""

  const { form, handleSubmitWithAction } = useHookFormAction(
    importContactsAction.bind(null, workspaceId),
    zodResolver(importContactsRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.import.label"),
            }),
          )
          router.push(`/space/${workspaceId}/contacts/import/histories`)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
            return
          }

          const rootErrors = error.validationErrors?._errors
          if (rootErrors?.length) {
            toast.error(rootErrors[0])
            return
          }

          toast.error(
            t("messages.createdFailed", { feature: t("fields.import.label") }),
          )
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          fileId: "",
          inboxId: "",
          timezone: undefined,
          countryCode: undefined,
          fieldMapping: [{ column: "", customFieldId: "" }],
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    form.setValue("fileId", fileId, { shouldValidate: true })
  }, [fileId, form.setValue])

  useEffect(() => {
    setTimezone(getBrowserTimezone())
  }, [])

  useEffect(() => {
    if (timezone) {
      form.setValue("timezone", timezone, {
        shouldValidate: true,
      })
    }
  }, [timezone, form.setValue])

  // Set the column mapping from a file's headers. Done in the same event
  // handler that updates `csvHeaders` (never a later effect) so each Select
  // sees its new value and new options in one commit — otherwise Base UI
  // Select briefly holds the previous file's value against the new options,
  // fires `onValueChange(null)`, and overwrites the mapping with null.
  const applyHeaderMapping = (headers: string[]) => {
    const columnByField = matchContactImportHeaders(headers)
    for (const field of contactImportFields.options) {
      form.setValue(field, columnByField[field], { shouldValidate: true })
    }
  }

  return (
    <>
      <div className="flex justify-end gap-4">
        <a
          className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline"
          download
          href={`/space/${workspaceId}/contacts/import/template`}
        >
          <DownloadIcon size={16} />
          {t("actions.downloadTemplate")}
        </a>
        <Link
          className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline"
          href={`/space/${workspaceId}/contacts/import/histories`}
        >
          <HistoryIcon size={16} />
          {t("fields.import.histories.title")}
        </Link>
      </div>
      <ImportDropzone
        onCleared={() => {
          setFileId("")
          setCsvHeaders([])
          applyHeaderMapping([])
        }}
        onUploaded={(result, headers) => {
          setFileId(result.fileId)
          setCsvHeaders(headers)
          applyHeaderMapping(headers)
        }}
        onUploadingChange={setIsUploading}
        subType={importTypes.enum.contacts}
        type={uploadTypes.enum.import}
        workspaceId={workspaceId}
      />
      {hasFile && (
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <SettingsSection csvHeaders={csvHeaders} />
            <div className="flex justify-end gap-4">
              <Button
                onClick={() => router.push(`/space/${workspaceId}/contacts`)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  isUploading ||
                  !form.formState.isValid ||
                  form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      )}
    </>
  )
}

function SettingsSection({ csvHeaders }: { csvHeaders: string[] }) {
  const t = useTranslations()
  const channelOptions = useConfiguredInboxTypeOptions().filter(
    (option) => option.value !== channelTypes.enum.omnichannel,
  )
  const [channel, setChannel] = useState<string | undefined>(undefined)
  const inboxOptions = useInboxOptionsByChannel(channel)
  const { setValue } = useFormContext()

  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label={t("fields.source.label")}
        name="channel"
        options={channelOptions}
        required
        triggerValueChange={(value) => {
          setChannel(value)
          setValue("inboxId", "")
          setValue("countryCode", undefined)
        }}
      />
      <SelectField
        label={t("fields.inbox.label")}
        name="inboxId"
        options={inboxOptions}
        required
      />
      {channel === channelTypes.enum.whatsapp && (
        <InputField
          label={t("fields.countryCode.label")}
          name="countryCode"
          placeholder="+1"
        />
      )}
      <div className="mt-8 flex flex-col gap-4">
        {channel !== channelTypes.enum.whatsapp && (
          <HeaderConnectField
            csvHeaders={csvHeaders}
            label={t("fields.contactId.label")}
            name="contactId"
          />
        )}
        <HeaderConnectField
          allowClear={channel !== channelTypes.enum.whatsapp}
          csvHeaders={csvHeaders}
          label={t("fields.phoneNumber.label")}
          name="phoneNumber"
        />
        <HeaderConnectField
          allowClear
          csvHeaders={csvHeaders}
          label={t("fields.email.label")}
          name="email"
        />
        <HeaderConnectField
          allowClear
          csvHeaders={csvHeaders}
          label={t("fields.firstName.label")}
          name="firstName"
        />
        <HeaderConnectField
          allowClear
          csvHeaders={csvHeaders}
          label={t("fields.lastName.label")}
          name="lastName"
        />
      </div>
      <MoreOptions csvHeaders={csvHeaders} />
    </div>
  )
}

function HeaderConnectField({
  csvHeaders,
  name,
  label,
  allowClear,
}: {
  csvHeaders: string[]
  name: string
  label: string
  allowClear?: boolean
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        {/* Remount the Select when the header set changes so it re-renders
            from the current form value instead of keeping the previous file's
            label (Base UI Select does not clear a stale label when its options
            change out from under it). */}
        <SelectField
          allowClear={allowClear}
          key={csvHeaders.join("")}
          name={name}
          options={csvHeaders.map((col) => ({ label: col, value: col }))}
        />
      </div>
      <ArrowRightIcon className="rtl:rotate-180" size={20} />
      <div className="flex-1">
        <Input disabled value={label} />
      </div>
    </div>
  )
}

function MoreOptions({ csvHeaders }: { csvHeaders: string[] }) {
  const t = useTranslations()
  const tagOptions = useTagSelectOptions()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "fieldMapping",
  })

  return (
    <Accordion className="w-full">
      <AccordionItem
        className="transition-all hover:data-[state=open]:rounded-none"
        key="moreOptions"
        value="moreOptions"
      >
        <AccordionTrigger className="rounded-none border-t p-2 transition-all hover:bg-gray-200 hover:no-underline data-[state=open]:bg-gray-200">
          <div className="flex items-center gap-2">
            {t("actions.moreOptions")}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="mt-4 flex flex-col gap-4">
            <SelectField
              label={t("fields.tag.label")}
              name="tagId"
              options={tagOptions}
            />

            <div className="flex flex-col gap-2">
              <div className="select-none font-medium text-sm leading-none">
                {t("actions.setCustomField")}
              </div>
              {fields.map((field, index) => (
                <div className="flex items-center gap-4" key={field.id}>
                  <div className="flex-1">
                    <SelectField
                      allowClear
                      name={`fieldMapping.${index}.column`}
                      options={csvHeaders.map((col) => ({
                        label: col,
                        value: col,
                      }))}
                    />
                  </div>
                  <ArrowRightIcon className="rtl:rotate-180" size={20} />
                  <div className="flex-1">
                    <CustomFieldSelect
                      label=""
                      name={`fieldMapping.${index}.customFieldId`}
                    />
                  </div>
                  <Button
                    aria-label={t("actions.delete")}
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon size={16} />
                  </Button>
                </div>
              ))}
            </div>

            {/* M-7: Server schema limits fieldMapping to 10 entries; disable Add
                button at the cap so the user gets immediate feedback. */}
            <Button
              disabled={fields.length >= 10}
              onClick={() => append({ column: "", customFieldId: "" })}
              type="button"
              variant="outline"
            >
              {t("actions.add")}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
