"use client"

import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import type { MultiSelectGroup } from "@aha.chat/ui/components/ui/sersavan/multi-select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCustomFieldSelectOptions } from "../custom-fields/provider/custom-field-hook"
import { useTagSelectOptions } from "../tags/provider/tag-hook"
import { exportContactsAction } from "./actions/export-contacts.action"
import {
  contactFieldPrefix,
  contactPrefix,
  contactTagPrefix,
  exportContactsRequest,
} from "./schemas/action"

export function ExportContactDialog({
  chatbotId,
  contactIds,
  trigger,
}: {
  chatbotId: string
  contactIds: string[]
  trigger: React.ReactElement
}) {
  const t = useTranslations()

  const customFieldOptions = useCustomFieldSelectOptions({
    prefix: contactFieldPrefix,
  })
  const tagOptions = useTagSelectOptions({ prefix: contactTagPrefix })

  const options: MultiSelectGroup[] = [
    {
      heading: t("fields.botFields.label"),
      options: [
        {
          label: t("fields.firstName.label"),
          value: `${contactPrefix}:firstName`,
        },
        {
          label: t("fields.lastName.label"),
          value: `${contactPrefix}:lastName`,
        },
        {
          label: t("fields.fullName.label"),
          value: `${contactPrefix}:fullName`,
        },
        { label: t("fields.email.label"), value: `${contactPrefix}:email` },
        {
          label: t("fields.phoneNumber.label"),
          value: `${contactPrefix}:phoneNumber`,
        },
      ],
    },
    {
      heading: t("fields.customFields.label"),
      options: customFieldOptions,
    },
    {
      heading: t("fields.tags.label"),
      options: tagOptions,
    },
  ]

  const { form, handleSubmitWithAction } = useHookFormAction(
    exportContactsAction.bind(null, chatbotId),
    zodResolver(exportContactsRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.exportedSuccess", {
              feature: t("fields.contact.label"),
            }),
          )
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
          contactIds,
          fields: options[0].options.slice(0, 5).map((opt) => opt.value), // Get first 5 options from the account
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("actions.exportContacts")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <MultiSelectField name="fields" options={options} />

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="outline">{t("actions.cancel")}</Button>
                </DialogClose>

                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" />
                  )}
                  {t("actions.export")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
