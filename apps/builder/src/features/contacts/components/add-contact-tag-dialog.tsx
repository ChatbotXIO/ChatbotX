"use client"

import { FormFieldWrapper } from "@/components/form/field-wrapper"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import type { TagCollection } from "@/features/tags/schemas"
import { callAPI } from "@/lib/swr"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { TagInput, type Tag } from "emblor"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useState, type ReactElement } from "react"
import type { FieldValues } from "react-hook-form"
import { toast } from "sonner"
import { addContactTagAction } from "../actions/add-contact-tag.action"
import { addContactTagRequest } from "../schemas/add-contact-tag.request"

interface AddContactTagDialogProps {
  trigger: ReactElement
  ids: string[]
}

export default function AddContactTagDialog({
  trigger,
  ids,
}: AddContactTagDialogProps) {
  const [open, setOpen] = useState(false)
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)
  const [tags, setTags] = useState<Tag[]>([])

  const { chatbotId } = useParams<{ chatbotId: string }>()

  // Get tags list
  const { data: tagsData } = callAPI<TagCollection>(
    `/api/chatbots/${chatbotId}/tags?perPage=9999`,
  )
  const tagOptions = (tagsData?.data ?? []).map((v) => ({
    text: v.name,
    id: v.id,
  }))

  const {
    form,
    handleSubmitWithAction,
    form: { setValue },
  } = useHookFormAction(
    addContactTagAction.bind(null, chatbotId),
    zodResolver(addContactTagRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(<T keyName="common.updateForm.successMessage" />)
          setOpen(false)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          ids,
          tags: [],
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={handleSubmitWithAction}
            className="flex flex-col gap-2"
          >
            <FormFieldWrapper<FieldValues>
              name="tags"
              label="Tags"
              isRequired={true}
            >
              {(field) => (
                <TagInput
                  {...field}
                  enableAutocomplete={true}
                  autocompleteOptions={tagOptions}
                  // placeholder="Enter a topic"
                  tags={tags}
                  className="sm:min-w-[450px]"
                  setTags={(newTags) => {
                    setTags(newTags)
                    setValue(
                      "tags",
                      (newTags as Tag[]).map((t) => t.text),
                      { shouldValidate: true },
                    )
                  }}
                  activeTagIndex={activeTagIndex}
                  setActiveTagIndex={setActiveTagIndex}
                />
              )}
            </FormFieldWrapper>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>

              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                <T keyName={"common.saveBtn"} />
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
