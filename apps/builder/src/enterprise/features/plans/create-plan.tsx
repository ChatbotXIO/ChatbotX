"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { FieldLabel } from "@aha.chat/ui/components/ui/field"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
// biome-ignore lint/performance/noNamespaceImport: safe import
import * as currentCode from "currency-codes"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useFieldArray, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createPlanAction } from "./actions/create-plan-action"
import { createPlanRequest } from "./schemas/action"

export function CreatePlanDialog() {
  const t = useTranslations()
  const router = useRouter()

  const [open, setOpen] = useState(false)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          {t("actions.createFeature", { feature: t("fields.plan.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0">
        <DialogHeader className="sticky top-0 z-10 shrink-0 border-b bg-background px-6 py-4">
          <DialogTitle>
            {t("actions.createFeature", { feature: t("fields.plan.label") })}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <CreatePlanForm
            onClose={() => {
              setOpen(false)
              router.refresh()
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CreatePlanForm({ onClose }: { onClose?: () => void }) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(createPlanAction, zodResolver(createPlanRequest), {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.plan.label"),
            }),
          )
          resetFormAndAction()
          onClose?.()
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
          name: "",
          description: "",
          currency: "USD",
          price: 0,
          annualPrice: "",
          limits: {
            contacts: 1,
          },
          freeTrial: {
            days: 0,
          },
          marketingFeatures: [],
        },
      },
    })

  const {
    fields: marketingFeatures,
    append,
    remove,
  } = useFieldArray({
    control: form.control,
    name: "marketingFeatures",
  })

  const currency = useWatch({
    control: form.control,
    name: "currency",
  })

  const currentCodeOptions = useMemo(() => {
    return currentCode.codes().map((code) => ({
      label: code.toUpperCase(),
      value: code,
    }))
  }, [])

  return (
    <Form {...form}>
      <form
        className="flex flex-col space-y-6"
        onSubmit={handleSubmitWithAction}
      >
        <InputField label={t("fields.name.label")} name="name" required />

        <TextareaField
          label={t("fields.description.label")}
          name="description"
        />

        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="marketingFeatures">
            {t("fields.marketingFeatures.label")}
          </FieldLabel>
          <p className="text-muted-foreground text-sm">
            {t("fields.marketingFeatures.description")}
          </p>
          {marketingFeatures.map((field, index) => (
            <div className="flex gap-2" key={field.id}>
              <InputField
                className="flex-1"
                name={`marketingFeatures.${index}.value`}
              />
              <Button
                onClick={() => remove(index)}
                type="button"
                variant="outline"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            onClick={() => append({ value: "" })}
            type="button"
            variant="outline"
          >
            <PlusIcon className="size-4" />
            {t("actions.addFeature", {
              feature: t("fields.marketingFeatures.label"),
            })}
          </Button>
        </div>

        <Separator />

        <Label className="font-bold text-lg">{t("fields.pricing.label")}</Label>

        <ComboboxField
          label={t("fields.currency.label")}
          name="currency"
          options={currentCodeOptions}
          required
        />

        <InputNumberField
          formItemClassName="flex-1"
          label={t("fields.price.label")}
          min={0}
          name="price"
          required
          suffix={currency}
        />

        <InputNumberField
          label={t("fields.annualPrice.label")}
          min={0}
          name="annualPrice"
          suffix={currency}
        />

        <InputNumberField
          label={t("fields.freeTrial.label")}
          min={0}
          name="freeTrial.days"
          suffix={t("fields.freeTrial.suffix")}
        />

        <InputNumberField
          label={t("fields.limitContacts.label")}
          name="limits.contacts"
          required
        />

        <div className="flex justify-end">
          <Button onClick={onClose} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            className="ml-2"
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting ? (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t("actions.createFeature", { feature: t("fields.plan.label") })}
          </Button>
        </div>
      </form>
    </Form>
  )
}
