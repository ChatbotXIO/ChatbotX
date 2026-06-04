"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { FormEvent } from "react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"

type AiIntegrationApiKeyDialogProps<TForm extends FieldValues> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  form: UseFormReturn<TForm>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
}

/**
 * Shared "connect via API key" dialog for AI provider integrations. The owning
 * feature wires up the provider-specific action via `useHookFormAction` and
 * passes the resulting `form` + submit handler in.
 */
export function AiIntegrationApiKeyDialog<TForm extends FieldValues>({
  open,
  onOpenChange,
  title,
  form,
  onSubmit,
}: AiIntegrationApiKeyDialogProps<TForm>) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          {t("actions.connect")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-scroll sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", { feature: title })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={onSubmit}>
            <InputField
              label={t("fields.apiKey.label")}
              name={"apiKey" as Path<TForm>}
              required
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("actions.cancel")}
                </Button>
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
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
