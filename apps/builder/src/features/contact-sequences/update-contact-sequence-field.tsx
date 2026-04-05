"use client"

import type {
  ContactsOnSequenceModel,
  SequenceModel,
} from "@chatbotx.io/database/types"
import { SelectTagsInputField } from "@chatbotx.io/ui/components/form/select-tags-input-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { useWorkspaceId } from "@/hooks/routing"
import type { ContactResource } from "../contacts/schemas/resource"
import { updateContactSequenceAction } from "./actions/update-contact-sequence.action"
import {
  type ContactOnSequenceWithRelations,
  updateContactSequenceRequest,
} from "./schema"

export default function UpdateContactSequenceField({
  contact,
  sequences,
  onSuccess,
}: {
  contact: ContactResource
  sequences: ContactOnSequenceWithRelations[]
  onSuccess?: (updatedSequences: ContactOnSequenceWithRelations[]) => void
}) {
  const workspaceId = useWorkspaceId()

  const t = useTranslations()

  const sequenceOptions = useSequenceOptions()
  const sequenceSelectOptions = sequenceOptions.map((sequence) => ({
    label: sequence.name,
    value: sequence.id,
  }))

  const [currentSequencesIds, setCurrentSequencesIds] = useState<string[]>(
    () => sequences?.map((cos) => cos.sequence.id).filter(Boolean) ?? [],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateContactSequenceAction.bind(null, workspaceId),
    zodResolver(updateContactSequenceRequest),
    {
      actionProps: {
        onSuccess: ({ data: updatedSequences }) => {
          onSuccess?.(
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

  useEffect(() => {
    const newSequencesIds =
      sequences?.map((cos) => cos.sequence.id).filter(Boolean) ?? []
    setCurrentSequencesIds(newSequencesIds)
    form.setValue("sequences", newSequencesIds)
  }, [sequences, form])

  return (
    <Form {...form}>
      <form className="flex flex-1 flex-col gap-2">
        <SelectTagsInputField
          disabled={form.formState.isSubmitting}
          emptyMessage={t("fields.noResults.label")}
          label=""
          name="sequences"
          onSelect={(selectedTags) => {
            const ids = selectedTags.map((tag) => tag.value)
            setCurrentSequencesIds(ids)
            handleSubmitWithAction()
          }}
          options={sequenceSelectOptions}
          placeholder={t("fields.search.placeholder")}
          searchPlaceholder={t("fields.search.placeholder")}
        />
      </form>
    </Form>
  )
}
