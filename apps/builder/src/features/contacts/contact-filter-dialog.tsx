import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FilterIcon, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
import { useForm } from "react-hook-form"
import { ContactFilter } from "./components/contact-filter"
import { contactFilterRequest } from "./schemas/query"

export function ContactFilterDialog() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const form = useForm({
    resolver: zodResolver(contactFilterRequest),
    defaultValues: {
      contactFilter: {
        operator: "and",
        conditions: [],
      },
    },
  })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()

    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FilterIcon />
          {t("fields.filter.label")}
        </Button>
      </DialogTrigger>

      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form className="flex-1 space-y-4" onSubmit={onSubmit}>
              <ContactFilter parentName="contactFilter" />

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="ghost">{t("actions.cancel")}</Button>
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
                  {t("actions.filter")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
