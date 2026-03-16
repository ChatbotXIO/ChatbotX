"use client"

import { channelType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Input } from "@aha.chat/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { ArrowRightIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import FileDropzone from "@/components/file-dropzone"
import { CustomFieldSelect } from "../custom-fields/custom-field-select"
import { useConfiguredInboxTypeOptions } from "../inboxes/provider/inbox-hook"
import { useTagSelectOptions } from "../tags/provider/tag-hook"
import { importContactsAction } from "./actions/import-contacts.action"
import { importContactsRequest } from "./schemas/action"

export function ImportContactsForm({ chatbotId }: { chatbotId: string }) {
  const t = useTranslations()
  const router = useRouter()

  const [csvHeaders, setCsvHeaders] = useState<string[]>([])

  const {
    form,
    form: { register, setValue, resetField, unregister, formState },
    handleSubmitWithAction,
  } = useHookFormAction(
    importContactsAction.bind(null, chatbotId),
    zodResolver(importContactsRequest),
    {
      actionProps: {
        onSuccess: () => {
          // TODO
          router.push(`/chatbots/${chatbotId}/contacts`)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          channel: "messenger",
          fieldMapping: [
            {
              column: "",
              fieldId: "",
            },
          ],
        },
      },
      errorMapProps: {},
    },
  )

  const handleCancel = () => {
    router.push(`/chatbots/${chatbotId}/contacts`)
  }

  const handleSelectFile = (file: File) => {
    if (file) {
      const reader = new FileReader()
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const csvContent = e.target?.result as string
        const headerRow = csvContent.split("\n")[0]
        const columnNames = headerRow.split(",")
        setCsvHeaders(columnNames)
      }

      reader.readAsText(file)
    } else {
      setCsvHeaders([])
    }
  }

  return (
    <div className="my-4 flex flex-col items-center justify-center">
      <Form {...form}>
        <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
          <Card className="w-xl">
            <CardContent className="flex flex-col gap-4">
              <Card className="border-dashed">
                <FileDropzone
                  configs={{
                    uploadKeyName: "actions.uploadDocument",
                    accept: {
                      "application/csv": [".csv"],
                    },
                    isCard: true,
                  }}
                  mode="file"
                  onDrop={(file: File) => {
                    setValue("file", file, {
                      shouldValidate: true,
                    })
                    handleSelectFile(file)
                  }}
                  onRemove={() => {
                    resetField("file")
                    setCsvHeaders([])
                  }}
                  parentName="file"
                  register={register}
                  type="file"
                  unregister={unregister}
                />
              </Card>

              {csvHeaders.length > 0 && (
                <ContactsSettings csvHeaders={csvHeaders} />
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={handleCancel} type="button" variant="outline">
                  {t("actions.cancel")}
                </Button>

                <Button
                  disabled={!formState.isValid || formState.isSubmitting}
                  type="submit"
                >
                  {formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.confirm")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
}

export function ContactsSettings({ csvHeaders }: { csvHeaders: string[] }) {
  const t = useTranslations()
  const channelOptions = useConfiguredInboxTypeOptions()
  const [channel, setChannel] = useState<string | undefined>(undefined)

  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label={t("fields.source.label")}
        name="channel"
        options={channelOptions}
        triggerValueChange={setChannel}
      />
      {channel === channelType.whatsapp && (
        <InputField
          label={t("fields.countryCode.label")}
          name="countryCode"
          placeholder="+1"
        />
      )}
      {channel !== channelType.whatsapp && (
        <>
          <HeaderConnectContactField
            csvHeaders={csvHeaders}
            label={t("fields.contactId.label")}
            name="contactId"
          />
          <HeaderConnectContactField
            csvHeaders={csvHeaders}
            label={t("fields.phoneNumber.label")}
            name="phoneNumber"
          />
          <HeaderConnectContactField
            csvHeaders={csvHeaders}
            label={t("fields.email.label")}
            name="email"
          />
          <HeaderConnectContactField
            csvHeaders={csvHeaders}
            label={t("fields.firstName.label")}
            name="firstName"
          />
          <HeaderConnectContactField
            csvHeaders={csvHeaders}
            label={t("fields.lastName.label")}
            name="lastName"
          />
          <MoreOptions csvHeaders={csvHeaders} />
        </>
      )}
    </div>
  )
}

export function HeaderConnectContactField({
  csvHeaders,
  name,
  label,
}: {
  csvHeaders: string[]
  name: string
  label: string
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <SelectField
          name={name}
          options={csvHeaders.map((col) => ({ label: col, value: col }))}
        />
      </div>
      <ArrowRightIcon size={20} />
      <div className="flex-1">
        <Input disabled value={label} />
      </div>
    </div>
  )
}

export function MoreOptions({ csvHeaders }: { csvHeaders: string[] }) {
  const t = useTranslations()
  const tagOptions = useTagSelectOptions()
  const [fieldLength, setFieldLength] = useState<number>(1)

  return (
    <Accordion className="w-full" collapsible type="single">
      <AccordionItem
        className="transition-all hover:rounded-lg hover:data-[state=open]:rounded-none"
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
              {Array.from({ length: fieldLength }).map((_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: wip
                <div className="flex items-center gap-4" key={index}>
                  <div className="flex-1">
                    <SelectField
                      name={`fieldMapping.${index}.column`}
                      options={csvHeaders.map((col) => ({
                        label: col,
                        value: col,
                      }))}
                    />
                  </div>
                  <ArrowRightIcon size={20} />
                  <div className="flex-1">
                    <CustomFieldSelect
                      label=""
                      name={`fieldMapping.${index}.fieldId`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={() => setFieldLength((prev) => prev + 1)}
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
