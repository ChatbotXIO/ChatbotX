"use client"

import type {
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountMinimumType,
  DiscountType,
} from "@chatbotx.io/database/partials"
import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useId, useState } from "react"
import { Controller, type FieldPath, useForm } from "react-hook-form"
import { toast } from "sonner"
import { ContactFilter } from "@/features/contact-filter"
import type { ContactFilterCriteria } from "@/features/contact-filter/schema"
import {
  PERCENT_INPUT_PROPS,
  PRICE_INPUT_PROPS,
} from "@/features/products/constants"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import {
  createDiscountCodeAction,
  generateDiscountCodeAction,
  updateDiscountCodeAction,
} from "../actions/discount-code.action"
import type { DiscountCodeResource } from "../schema/public"
import { DeleteDiscountCodeDialog } from "./delete-discount-code-dialog"

type FormValues = {
  code: string
  autoApply: boolean
  discountType: DiscountType
  discountValue: number
  appliesTo: DiscountAppliesTo
  categoryId: string
  productIds: string[]
  minimumType: DiscountMinimumType
  minimumAmount: number
  minimumQuantity: number
  limitTotal: boolean
  usageLimit: number
  oncePerCustomer: boolean
  eligibility: DiscountEligibility
  customerFilter: ContactFilterCriteria
  /** ISO instants, so the picked wall-clock time keeps its offset. */
  startsAt: string
  endsAt: string | undefined
  isActive: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

const toFormValues = (code: DiscountCodeResource | undefined): FormValues => {
  const now = new Date()
  return {
    code: code?.code ?? "",
    autoApply: code?.autoApply ?? false,
    discountType: code?.discountType ?? "percentage",
    discountValue: code?.discountValue ?? 0,
    appliesTo: code?.appliesTo ?? "entireOrder",
    categoryId: code?.categoryId ?? "",
    productIds: code?.productIds ?? [],
    minimumType: code?.minimumType ?? "none",
    minimumAmount: code?.minimumType === "amount" ? code.minimumValue : 0,
    minimumQuantity: code?.minimumType === "quantity" ? code.minimumValue : 0,
    limitTotal: code ? code.usageLimit !== null : false,
    usageLimit: code?.usageLimit ?? 1,
    oncePerCustomer: code?.oncePerCustomer ?? false,
    eligibility: code?.eligibility ?? "everyone",
    customerFilter: (code?.customerFilter as ContactFilterCriteria | null) ?? {
      operator: "and",
      conditions: [],
    },
    startsAt: (code?.startsAt ?? now).toISOString(),
    endsAt: code
      ? code.endsAt?.toISOString()
      : new Date(now.getTime() + 30 * DAY_MS).toISOString(),
    isActive: code?.isActive ?? true,
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/** One checkbox with its label, bound to a boolean field. */
function CheckboxRow({
  name,
  label,
}: {
  name: FieldPath<FormValues>
  label: string
}) {
  const id = useId()
  return (
    <Controller
      name={name}
      render={({ field }) => (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={Boolean(field.value)}
            id={id}
            onCheckedChange={(checked) => field.onChange(Boolean(checked))}
          />
          <Label className="font-normal" htmlFor={id}>
            {label}
          </Label>
        </div>
      )}
    />
  )
}

type Option = { value: string; label: string }

export function DiscountCodeForm({
  workspaceId,
  discountCode,
  categories,
  products,
  currency,
}: {
  workspaceId: string
  discountCode?: DiscountCodeResource
  categories: Array<{ id: string; name: string; parentId: string | null }>
  products: Array<{ id: string; name: string }>
  currency: string
}) {
  const t = useTranslations("discountCodes")
  const router = useRouter()
  const listHref = `/space/${workspaceId}/discount-codes`
  const [deleting, setDeleting] = useState(false)
  const form = useForm<FormValues>({
    defaultValues: toFormValues(discountCode),
  })
  const discountType = form.watch("discountType")
  const appliesTo = form.watch("appliesTo")
  const minimumType = form.watch("minimumType")
  const limitTotal = form.watch("limitTotal")
  const eligibility = form.watch("eligibility")

  const generate = useAction(
    generateDiscountCodeAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data) {
          form.setValue("code", data.code, { shouldDirty: true })
        }
      },
      onError: toastActionError(t("saveError")),
    },
  )

  const save = useAction(
    discountCode
      ? updateDiscountCodeAction.bind(null, workspaceId, discountCode.id)
      : createDiscountCodeAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t(discountCode ? "updated" : "created"))
        router.push(listHref)
        router.refresh()
      },
      onError: toastActionError(t("saveError")),
    },
  )

  const onSubmit = form.handleSubmit((values) => {
    const minimumValue =
      values.minimumType === "amount"
        ? Number(values.minimumAmount)
        : Number(values.minimumQuantity)
    save.execute({
      code: values.code,
      autoApply: values.autoApply,
      discountType: values.discountType,
      discountValue: Number(values.discountValue) || 0,
      appliesTo: values.appliesTo,
      categoryId: values.categoryId || null,
      productIds: values.productIds,
      minimumType: values.minimumType,
      minimumValue: values.minimumType === "none" ? 0 : minimumValue || 0,
      usageLimit: values.limitTotal ? Number(values.usageLimit) : null,
      oncePerCustomer: values.oncePerCustomer,
      eligibility: values.eligibility,
      customerFilter:
        values.eligibility === "specificCustomers"
          ? values.customerFilter
          : null,
      startsAt: new Date(values.startsAt),
      endsAt: values.endsAt ? new Date(values.endsAt) : null,
      isActive: values.isActive,
    })
  })

  const parentName = (parentId: string | null) =>
    categories.find((category) => category.id === parentId)?.name
  const categoryOptions: Option[] = categories.map((category) => ({
    value: category.id,
    label: category.parentId
      ? `${parentName(category.parentId) ?? ""} › ${category.name}`
      : category.name,
  }))
  const productOptions: Option[] = products.map((product) => ({
    value: product.id,
    label: product.name,
  }))

  return (
    <Form {...form}>
      <form className="mx-auto max-w-3xl space-y-4" onSubmit={onSubmit}>
        <h1 className="font-bold text-xl">
          {discountCode ? t("edit") : t("add")}
        </h1>

        <Section title={t("form.discountCode")}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="discount-code">{t("form.code")}</Label>
              <Button
                disabled={generate.isPending}
                onClick={() => generate.execute()}
                size="sm"
                type="button"
                variant="link"
              >
                {t("form.generate")}
              </Button>
            </div>
            <InputField
              autoComplete="off"
              id="discount-code"
              maxLength={64}
              name="code"
              required
            />
          </div>
          <CheckboxRow label={t("form.autoApply")} name="autoApply" />
          <p className="text-muted-foreground text-sm">
            {form.watch("autoApply")
              ? t("form.autoApplyHint")
              : t("form.typedHint")}
          </p>
        </Section>

        <Section title={t("form.options")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("form.discountType")}
              name="discountType"
              options={(
                ["percentage", "fixedAmount", "freeShipping"] as const
              ).map((type) => ({
                value: type,
                label: t(`discountTypes.${type}`),
              }))}
            />
            {discountType === "freeShipping" ? null : (
              <InputNumberField
                label={
                  discountType === "percentage"
                    ? t("form.discountValuePercent")
                    : t("form.discountValueAmount", { currency })
                }
                min={0}
                name="discountValue"
                required
                {...(discountType === "percentage"
                  ? PERCENT_INPUT_PROPS
                  : PRICE_INPUT_PROPS)}
              />
            )}
          </div>
          {discountType === "freeShipping" ? (
            <p className="text-muted-foreground text-sm">
              {t("form.freeShippingHint")}
            </p>
          ) : null}
        </Section>

        {discountType === "freeShipping" ? null : (
          <Section title={t("form.appliesTo")}>
            <RadioGroupField
              name="appliesTo"
              options={(["entireOrder", "category", "products"] as const).map(
                (value) => ({ value, label: t(`appliesTo.${value}`) }),
              )}
            />
            {appliesTo === "category" ? (
              <SelectField
                label={t("form.category")}
                name="categoryId"
                options={categoryOptions}
                required
              />
            ) : null}
            {appliesTo === "products" ? (
              <MultiSelectField
                label={t("form.products")}
                name="productIds"
                options={productOptions}
                placeholder={t("form.productsPlaceholder")}
                required
              />
            ) : null}
          </Section>
        )}

        <Section title={t("form.minimumRequirement")}>
          <RadioGroupField
            name="minimumType"
            options={(["none", "amount", "quantity"] as const).map((value) => ({
              value,
              label: t(`minimumTypes.${value}`),
            }))}
          />
          {minimumType === "amount" ? (
            <div className="max-w-xs">
              <InputNumberField
                label={t("form.minimumAmount", { currency })}
                min={0}
                name="minimumAmount"
                required
                {...PRICE_INPUT_PROPS}
              />
            </div>
          ) : null}
          {minimumType === "quantity" ? (
            <div className="max-w-xs">
              <InputNumberField
                label={t("form.minimumQuantity")}
                min={1}
                name="minimumQuantity"
                required
                step={1}
              />
            </div>
          ) : null}
        </Section>

        <Section title={t("form.usageLimits")}>
          <CheckboxRow label={t("form.limitTotal")} name="limitTotal" />
          {limitTotal ? (
            <div className="max-w-xs ps-6">
              <InputNumberField
                aria-label={t("form.limitTotal")}
                min={1}
                name="usageLimit"
                required
                step={1}
              />
              {discountCode ? (
                <p className="pt-1 text-muted-foreground text-xs">
                  {t("form.usedSoFar", { count: discountCode.usedCount })}
                </p>
              ) : null}
            </div>
          ) : null}
          <CheckboxRow
            label={t("form.oncePerCustomer")}
            name="oncePerCustomer"
          />
        </Section>

        <Section title={t("form.customerEligibility")}>
          <RadioGroupField
            name="eligibility"
            options={(["everyone", "specificCustomers"] as const).map(
              (value) => ({
                value,
                label: t(`eligibilities.${value}`),
                description:
                  value === "specificCustomers"
                    ? t("form.specificCustomersHint")
                    : undefined,
              }),
            )}
          />
          {eligibility === "specificCustomers" ? (
            <ContactFilter parentName="customerFilter" />
          ) : null}
        </Section>

        <Section title={t("form.activeDates")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateTimePickerField
              displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
              granularity="minute"
              label={t("form.startDate")}
              name="startsAt"
              required
              saveFormat="iso"
            />
            <DateTimePickerField
              displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
              granularity="minute"
              label={t("form.endDate")}
              name="endsAt"
              placeholder={t("never")}
              saveFormat="iso"
            />
          </div>
          <CheckboxRow label={t("form.isActive")} name="isActive" />
        </Section>

        <div className="flex items-center justify-between gap-2">
          {discountCode ? (
            <Button
              onClick={() => setDeleting(true)}
              type="button"
              variant="ghost"
            >
              {t("delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => router.push(listHref)}
              type="button"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={save.isPending} type="submit">
              {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
              {t("save")}
            </Button>
          </div>
        </div>
      </form>
      {discountCode && deleting ? (
        <DeleteDiscountCodeDialog
          discountCode={discountCode}
          onDeleted={() => router.push(listHref)}
          onOpenChange={setDeleting}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </Form>
  )
}
