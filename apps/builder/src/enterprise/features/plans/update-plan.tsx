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
import { useEffect, useMemo } from "react"
import { useFieldArray, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { updatePlanAction } from "./actions/update-plan-action"
import { updatePlanRequest } from "./schemas/action"
import type { PlanResource } from "./schemas/resource"

type UpdatePlanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanResource | null
}

export function UpdatePlanDialog({
  open,
  onOpenChange,
  plan,
}: UpdatePlanDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { reset },
  } = useHookFormAction(updatePlanAction, zodResolver(updatePlanRequest), {
    actionProps: {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("fields.plan.label"),
          }),
        )
        onOpenChange(false)
        router.refresh()
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
    errorMapProps: {},
  })

  useEffect(() => {
    if (!plan) {
      return
    }

    reset({
      id: plan.id,
      name: plan.name,
      description: plan.description ?? "",
      currency: plan.currency,
      price: plan.price,
      annualPrice: plan.annualDiscountPrice ?? undefined,
      limits: {
        contacts: (plan.limits as { contacts: number }).contacts,
      },
      freeTrial: (plan.freeTrial as { days: number } | null) ?? { days: 0 },
      marketingFeatures: plan.marketingFeatures.map((value) => ({ value })),
    })
  }, [plan, reset])

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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0">
        <DialogHeader className="sticky top-0 z-10 shrink-0 border-b bg-background px-6 py-4">
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.plan.label") })}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <Form {...form}>
            <form
              className="flex flex-col space-y-6"
              onSubmit={handleSubmitWithAction}
            >
              <input type="hidden" {...form.register("id")} />

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

              <Label className="font-bold text-lg">
                {t("fields.pricing.label")}
              </Label>

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
                <Button
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("actions.cancel")}
                </Button>
                <Button
                  className="ml-2"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting ? (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("actions.update")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
