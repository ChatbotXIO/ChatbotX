"use client"

import type {
  ContactsOnSequenceModel,
  SequenceModel,
} from "@aha.chat/database/types"
import { Form } from "@aha.chat/ui/components/ui/form"
import { SelectTagsInputField } from "@aha.chat/ui/components/ui/muhammada86/select-tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import type { ContactResource } from "../contacts/schemas/resource"
import { updateContactSequenceAction } from "./actions/update-contact-sequence.action"
import { updateContactSequenceRequest } from "./schemas/contact-sequence"

export default function UpdateContactSequenceField({
  contact,
  sequences,
  onSuccess,
}: {
  contact: ContactResource
  sequences: (ContactsOnSequenceModel & { sequence: SequenceModel })[]
  onSuccess: (
    updatedSequences: (ContactsOnSequenceModel & { sequence: SequenceModel })[],
  ) => void
}) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const sequenceOptions = useSequenceOptions()
  const sequenceSelectOptions = sequenceOptions.map((sequence) => ({
    label: sequence.name,
    value: sequence.id,
  }))

  const [currentSequencesIds, setCurrentSequencesIds] = useState<string[]>(
    () =>
      sequences
        ?.map((cos) => cos.sequence.id)
        .filter((id): id is string => !!id) ?? [],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateContactSequenceAction.bind(null, chatbotId),
    zodResolver(updateContactSequenceRequest),
    {
      actionProps: {
        onSuccess: ({ data: updatedSequences }) => {
          onSuccess(
            updatedSequences as (ContactsOnSequenceModel & {
              sequence: SequenceModel
            })[],
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
          sequences: currentSequencesIds,
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Form {...form}>
      <form className="flex flex-1 flex-col gap-2">
        <SelectTagsInputField
          disabled={form.formState.isSubmitting}
          emptyMessage={t("sequences.field.emptyMessage")}
          label=""
          name="sequences"
          onSelect={(selectedTags) => {
            const ids = selectedTags.map((tag) => tag.value)
            setCurrentSequencesIds(ids)
            handleSubmitWithAction()
          }}
          options={sequenceSelectOptions}
          placeholder={t("sequences.field.placeholder")}
          searchPlaceholder={t("sequences.field.searchPlaceholder")}
        />
      </form>
    </Form>
  )
}
