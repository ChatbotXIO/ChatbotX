"use client"

import { SelectTagsInputField } from "@chatbotx.io/ui/components/form/select-tags-input-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { useWorkspaceId } from "@/hooks/routing"
import type { ContactResource } from "../contacts/schema/resource"
import { updateContactSequenceAction } from "./actions/update-contact-sequence.action"
import { updateContactSequenceRequest } from "./schema"

type ContactSequence = {
  sequence: {
    id: string
    name: string
  }
}

export default function UpdateContactSequenceField({
  contact,
  sequences,
  onSuccess,
}: {
  contact: ContactResource
  sequences: ContactSequence[]
  onSuccess?: (updatedSequences: ContactSequence[]) => void
}) {
  const workspaceId = useWorkspaceId()

  const t = useTranslations()

  const sequenceOptions = useSequenceOptions()
  const sequenceSelectOptions = sequenceOptions.map((sequence) => ({
    label: sequence.name,
    value: sequence.id,
  }))

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateContactSequenceAction.bind(null, workspaceId),
    zodResolver(updateContactSequenceRequest),
    {
      actionProps: {
        onSuccess: ({ data: updatedSequences }) => {
          onSuccess?.(
            updatedSequences.map((sequence) => ({
              sequence: {
                id: sequence.sequence.id,
                name: sequence.sequence.name,
              },
            })),
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
          contactId: contact?.id ?? "",
          sequences: sequences.map((item) => item.sequence.id),
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    form.setValue(
      "sequences",
      sequences.map((item) => item.sequence.id),
    )
  }, [sequences, form])

  return (
    <Form {...form}>
      <form className="flex flex-1 flex-col gap-2">
        <SelectTagsInputField
          disabled={form.formState.isSubmitting}
          emptyMessage={t("fields.noResults.label")}
          label=""
          name="sequences"
          onSelect={async (selectedTags) => {
            const ids = selectedTags.map((tag) => tag.value)
            form.setValue("sequences", ids, {
              shouldDirty: true,
              shouldValidate: true,
            })
            await handleSubmitWithAction()
          }}
          options={sequenceSelectOptions}
          placeholder={t("fields.search.placeholder")}
          searchPlaceholder={t("fields.search.placeholder")}
        />
      </form>
    </Form>
  )
}
