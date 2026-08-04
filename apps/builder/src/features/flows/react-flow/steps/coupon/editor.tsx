"use client"

import {
  type CouponStepSchema,
  markCouponUsedStepSchema,
  setUpCouponStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { TicketPercentIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import type { Resolver, SubmitHandler } from "react-hook-form"
import { useForm, useFormContext } from "react-hook-form"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { BaseStepEditor } from "../base/editor"
import { useParentStepCommit } from "../base/use-parent-step-commit"

type CouponStepType =
  | typeof stepTypes.enum.setUpCoupon
  | typeof stepTypes.enum.markCouponUsed

export function CouponActionEditor({ parentName }: { parentName: string }) {
  const t = useTranslations()
  const { getValues } = useFormContext()
  const commitStep = useParentStepCommit<CouponStepSchema>(parentName)
  const current = getValues(parentName) as CouponStepSchema
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<CouponStepType>(
    current.stepType,
  )
  const schema = useMemo(
    () =>
      selectedType === stepTypes.enum.markCouponUsed
        ? markCouponUsedStepSchema
        : setUpCouponStepSchema,
    [selectedType],
  )
  const form = useForm<CouponStepSchema>({
    resolver: zodResolver(schema) as Resolver<CouponStepSchema>,
    defaultValues: current,
    mode: "onChange",
  })
  const watchedStepType = form.watch("stepType")
  const { options: topics } = useCouponTopicOptions({
    issueableOnly: selectedType === stepTypes.enum.setUpCoupon,
  })
  const titleStepType =
    watchedStepType === stepTypes.enum.markCouponUsed
      ? stepTypes.enum.markCouponUsed
      : stepTypes.enum.setUpCoupon
  const dialogTitle =
    titleStepType === stepTypes.enum.markCouponUsed
      ? t("flows.actions.markCouponUsed")
      : t("flows.actions.setUpCoupon")
  const typeOptions = useMemo(
    () => [
      {
        label: t("flows.actions.setUpCoupon"),
        value: stepTypes.enum.setUpCoupon,
      },
      {
        label: t("flows.actions.markCouponUsed"),
        value: stepTypes.enum.markCouponUsed,
      },
    ],
    [t],
  )

  useEffect(() => {
    if (open) {
      const latest = getValues(parentName) as CouponStepSchema
      setSelectedType(latest.stepType)
      form.reset(latest)
    }
  }, [form, getValues, open, parentName])

  const onSubmit: SubmitHandler<CouponStepSchema> = (values) => {
    commitStep(values)
    setOpen(false)
  }

  const handleTypeChange = (value?: string) => {
    const nextType =
      value === stepTypes.enum.markCouponUsed
        ? stepTypes.enum.markCouponUsed
        : stepTypes.enum.setUpCoupon

    setSelectedType(nextType)
    form.setValue("stepType", nextType, {
      shouldDirty: true,
      shouldValidate: true,
    })
    queueMicrotask(() => {
      form.trigger().catch(() => undefined)
    })
  }

  return (
    <BaseStepEditor icon={TicketPercentIcon} title={dialogTitle}>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger
          render={
            <Button size="sm" type="button" variant="outline">
              {t("actions.update")}
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{t("coupons.description")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <SelectField
                label={t("fields.type.label")}
                name="stepType"
                options={typeOptions}
                required
                triggerValueChange={handleTypeChange}
              />
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("coupons.fields.topic")}
                name="topicId"
                options={topics}
                placeholder={t("actions.pleaseSelect")}
                required
              />
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("actions.cancel")}
                </Button>
                <Button disabled={!form.formState.isValid} type="submit">
                  {t("actions.continue")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </BaseStepEditor>
  )
}
