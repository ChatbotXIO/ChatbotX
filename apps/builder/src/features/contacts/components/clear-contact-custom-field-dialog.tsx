"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { clearContactCustomFieldAction } from "../actions/clear-contact-custom-field.action"
import { clearContactCustomFieldRequest } from "../schemas/clear-contact-custom-field.request"

type ClearContactCustomFieldDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function ClearContactCustomFieldDialog({
  trigger,
  ids,
}: ClearContactCustomFieldDialogProps) {
  const [open, setOpen] = useState(false)

  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { form, handleSubmitWithAction } = useHookFormAction(
    clearContactCustomFieldAction.bind(null, chatbotId),
    zodResolver(clearContactCustomFieldRequest),
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
          customFieldId: "",
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <CustomFieldSelect label="CustomField" name="customFieldId" />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
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
