import { InputField } from "@/components/form/input-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { toast } from "sonner"
import { updateContactAction } from "./actions/update-contact.action"
import type { ContactResource } from "./schemas"
import { updateContactRequest } from "./schemas/update-contact.request"

interface EditContactField {
  chatbotId: string
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: ContactResource
  selectedField: string | null
}

export function EditContactField({
  chatbotId,
  id,
  open,
  onOpenChange,
  // contact,
  selectedField,
}: EditContactField) {
  const { t } = useTranslate()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateContactAction.bind(null, chatbotId, id),
      zodResolver(updateContactRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(t("contact.updated"))
            onOpenChange(false)
            resetFormAndAction()
          },
          onError: ({ error }) => {
            error.serverError && toast.error(error.serverError)
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {},
        },
        errorMapProps: {},
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="contact.updateAction.title" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction}>
            <InputField
              name={selectedField || ""}
              label={`contact.fields.${selectedField || ""}`}
            />

            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                size="sm"
              >
                <T keyName="common.cancelBtn" />
              </Button>
              <Button type="submit" size="sm">
                <T keyName="common.saveBtn" />
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
