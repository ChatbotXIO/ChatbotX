"use client"

import type { TagModel } from "@aha.chat/database/types"
import { Form } from "@aha.chat/ui/components/ui/form"
import { TagsInputField } from "@aha.chat/ui/components/ui/muhammada86/tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { useTagOptions } from "@/features/tags/provider/tag-hook"
import { updateContactTagAction } from "../actions/update-contact-tag.action"
import { updateContactTagRequest } from "../schemas/contact-tag"
import type { ContactResource } from "../schemas/resource"

export default function UpdateContactTagField({
  contact,
  tags,
  onSuccess,
}: {
  contact: ContactResource
  tags: TagModel[]
  onSuccess: (updatedTags: TagModel[]) => void
}) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const [currentTagsName, setCurrentTagsName] = useState<string[]>(
    tags.map((tag) => tag.name) ?? [],
  )

  const tagOptions = useTagOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateContactTagAction.bind(null, chatbotId),
    zodResolver(updateContactTagRequest),
    {
      actionProps: {
        onSuccess: ({ data: updatedTags }) => {
          onSuccess(updatedTags)
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
          tags: currentTagsName,
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Form {...form}>
      <form className="flex flex-1 flex-col gap-2">
        <TagsInputField
          label=""
          name="tags"
          onSelect={(value: string[]) => {
            setCurrentTagsName(value)
            handleSubmitWithAction()
          }}
          suggestions={tagOptions}
        />
      </form>
    </Form>
  )
}
