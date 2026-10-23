"use client"

import type {
  CollectionType,
  SendCollectionStepSchema,
} from "@chatbotx.io/flow-config"
import { COLLECTION_MAX_PRODUCTS } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { MultiSelect } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { useTranslations } from "next-intl"
import { type ReactNode, useId, useState } from "react"
import { useCollectionOptions } from "./use-collection-options"

/** "All" in the condition pickers; stored as null. */
const ALL = "all"

type CollectionValues = Pick<
  SendCollectionStepSchema,
  "collectionType" | "conditions" | "productIds"
>

const toValues = (step: SendCollectionStepSchema): CollectionValues => ({
  collectionType: step.collectionType,
  conditions: step.conditions,
  productIds: step.productIds,
})

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

function ConditionSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string | null
  options: Array<{ value: string; label: string }>
  onChange: (value: string | null) => void
  disabled?: boolean
}) {
  const t = useTranslations("flows.sendCollection")
  const id = useId()
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        disabled={disabled}
        items={[{ value: ALL, label: t("all") }, ...options]}
        onValueChange={(next) =>
          onChange(next === ALL || next === null ? null : String(next))
        }
        value={value ?? ALL}
      >
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("all")}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** The collection's setup, as the spec shows it (images 28–29). */
export function CollectionDialog({
  step,
  open,
  onOpenChange,
  onSave,
}: {
  step: SendCollectionStepSchema
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (values: CollectionValues) => void
}) {
  const t = useTranslations("flows.sendCollection")
  const options = useCollectionOptions()
  const nameId = useId()
  const [values, setValues] = useState<CollectionValues>(() => toValues(step))
  const [wasOpen, setWasOpen] = useState(open)

  // Load the saved step each time the dialog opens — not whenever `step`
  // changes while it is open (an autosave elsewhere in the flow), which
  // would wipe the selection being edited.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(toValues(step))
    }
  }

  const setCondition = (patch: Partial<CollectionValues["conditions"]>) =>
    setValues((current) => ({
      ...current,
      conditions: { ...current.conditions, ...patch },
    }))

  const manual = values.collectionType === "manual"
  const canSave = !manual || values.productIds.length > 0
  const allProductIds = options.productOptions
    .slice(0, COLLECTION_MAX_PRODUCTS)
    .map((option) => option.value)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Section title={t("dataType")}>
            <Select
              disabled
              items={[{ value: "products", label: t("dataTypes.products") }]}
              value="products"
            >
              <SelectTrigger aria-label={t("dataType")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="products">
                  {t("dataTypes.products")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Section>

          <Section title={t("collectionType")}>
            <RadioGroup
              className="gap-4"
              onValueChange={(next) =>
                setValues((current) => ({
                  ...current,
                  collectionType: String(next) as CollectionType,
                }))
              }
              value={values.collectionType}
            >
              {(["automated", "manual"] as const).map((type) => (
                <Label
                  className="flex cursor-pointer items-start gap-3 font-normal"
                  htmlFor={`${nameId}-${type}`}
                  key={type}
                >
                  <RadioGroupItem
                    className="mt-0.5"
                    id={`${nameId}-${type}`}
                    value={type}
                  />
                  <span className="space-y-1">
                    <span className="block font-medium">
                      {t(`collectionTypes.${type}.label`)}
                    </span>
                    <span className="block text-muted-foreground text-sm">
                      {t(`collectionTypes.${type}.description`)}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </Section>

          {manual ? (
            <Section title={t("items")}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("select")}</Label>
                  <div className="flex gap-1">
                    <Button
                      onClick={() =>
                        setValues((current) => ({
                          ...current,
                          productIds: allProductIds,
                        }))
                      }
                      size="sm"
                      type="button"
                      variant="link"
                    >
                      {t("selectAll")}
                    </Button>
                    <Button
                      onClick={() =>
                        setValues((current) => ({ ...current, productIds: [] }))
                      }
                      size="sm"
                      type="button"
                      variant="link"
                    >
                      {t("deselectAll")}
                    </Button>
                  </div>
                </div>
                <MultiSelect
                  defaultValue={values.productIds}
                  key={values.productIds.join(",")}
                  maxCount={3}
                  onValueChange={(productIds) =>
                    setValues((current) => ({
                      ...current,
                      productIds: productIds.slice(0, COLLECTION_MAX_PRODUCTS),
                    }))
                  }
                  options={options.productOptions}
                  placeholder={t("selectPlaceholder")}
                />
                <p className="text-muted-foreground text-xs">
                  {t("maxProducts", { count: COLLECTION_MAX_PRODUCTS })}
                </p>
              </div>
            </Section>
          ) : (
            <Section title={t("condition")}>
              <div className="space-y-1">
                <Label htmlFor={nameId}>
                  {t("name")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("optional")}
                  </span>
                </Label>
                <Input
                  id={nameId}
                  maxLength={255}
                  onChange={(event) =>
                    setCondition({ name: event.target.value })
                  }
                  value={values.conditions.name}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <ConditionSelect
                  disabled={options.isLoading}
                  label={t("category")}
                  onChange={(categoryId) =>
                    setCondition({ categoryId, subcategoryId: null })
                  }
                  options={options.categoryOptions}
                  value={values.conditions.categoryId}
                />
                <ConditionSelect
                  disabled={!values.conditions.categoryId}
                  label={t("subcategory")}
                  onChange={(subcategoryId) => setCondition({ subcategoryId })}
                  options={options.subcategoryOptionsOf(
                    values.conditions.categoryId,
                  )}
                  value={values.conditions.subcategoryId}
                />
                <ConditionSelect
                  disabled={options.isLoading}
                  label={t("vendor")}
                  onChange={(vendorId) => setCondition({ vendorId })}
                  options={options.vendorOptions}
                  value={values.conditions.vendorId}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t("automatedHint", { count: COLLECTION_MAX_PRODUCTS })}
              </p>
            </Section>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              onSave(values)
              onOpenChange(false)
            }}
            type="button"
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
