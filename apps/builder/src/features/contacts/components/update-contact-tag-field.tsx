"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useTagOptions } from "@/features/tags/provider/tag-hook"
import type { TagResource } from "@/features/tags/schema/resource"
import { updateContactTagAction } from "../actions/update-contact-tag.action"
import { updateContactTagRequest } from "../schemas/contact-tag"
import type { ContactResource } from "../schemas/resource"

export default function UpdateContactTagField({
  workspaceId,
  contact,
  tags,
  onSuccess,
}: {
  workspaceId: string
  contact: ContactResource
  tags: TagResource[]
  onSuccess: (updatedTags: TagResource[]) => void
}) {
  const [currentTagsName, setCurrentTagsName] = useState<string[]>(
    tags.map((tag) => tag.name) ?? [],
  )

  const tagOptions = useTagOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateContactTagAction.bind(null, workspaceId),
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
