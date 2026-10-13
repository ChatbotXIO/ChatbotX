"use client"

import {
  countMessageCharacters,
  getChannelFlowPolicy,
  type ProductMessageTextRule,
  type SendProductsDisplay,
  type SendProductsStepSchema,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { resolveFlowValidationCodeKey } from "../../../flow-validation-message"
import {
  countProducts,
  displayLabelKey,
  resolveFieldRules,
  type SendProductsFormIssue,
  type SendProductsFormValues,
  sendProductsDisplayOrder,
  switchDisplay,
  toFormValues,
  validateSendProductsForm,
} from "../lib/form"
import { ProductMultiSelect } from "./product-multi-select"

type SendProductsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: ChannelType
  step: SendProductsStepSchema
  onSave: (values: SendProductsFormValues) => void
}

function IssueMessage({
  issues,
  path,
}: {
  issues: SendProductsFormIssue[]
  path: string
}) {
  const t = useTranslations()
  const issue = issues.find((candidate) => candidate.path === path)
  const key = issue ? resolveFlowValidationCodeKey(issue.code) : null
  return key ? (
    <p className="text-destructive text-sm" role="alert">
      {t(key)}
    </p>
  ) : null
}

function CharacterCount({
  value,
  rule,
}: {
  value: string | undefined
  rule: ProductMessageTextRule
}) {
  const count = countMessageCharacters(value?.trim())
  return (
    <p
      className={
        count > rule.max
          ? "text-destructive text-xs"
          : "text-muted-foreground text-xs"
      }
    >
      {count}/{rule.max}
    </p>
  )
}

function SendProductsForm(props: Omit<SendProductsDialogProps, "open">) {
  const { channel, step, onSave, onOpenChange } = props
  const t = useTranslations()
  const capability = getChannelFlowPolicy(channel)?.productMessages
  const form = useForm<SendProductsFormValues>({
    defaultValues: toFormValues(step),
  })
  const { control, setValue, getValues, handleSubmit } = form
  const values = useWatch({ control }) as SendProductsFormValues
  const sections = useFieldArray({ control, name: "sections" })
  const [isExpandedByUser, setIsExpandedByUser] = useState(false)

  const rule = capability?.displays[values.display]
  const fieldRules = resolveFieldRules(rule, values)
  const issues = validateSendProductsForm({ channel, step, values })
  // A section already shows its own "pick products" message; repeating the
  // message-level one under the list would say the same thing twice.
  const sectionLevelIssues = issues.filter(
    (issue) =>
      !issues.some(
        (other) =>
          other.path.startsWith("sections.") && other.code === issue.code,
      ),
  )
  const productCount = countProducts(values)
  const hasText = Boolean(
    values.header?.trim() ||
      values.body?.trim() ||
      values.footer?.trim() ||
      values.sections.some((section) => section.title?.trim()),
  )
  const isProductsDisplay = values.display === "products"
  const isExpanded =
    !isProductsDisplay ||
    isExpandedByUser ||
    hasText ||
    values.sections.length > 1 ||
    fieldRules.hasRequiredText
  const canToggleExpanded =
    isProductsDisplay &&
    !(hasText || fieldRules.hasRequiredText || values.sections.length > 1)
  const displays = sendProductsDisplayOrder.filter(
    (display) => capability?.displays[display],
  )
  const maxSections = rule?.maxSections ?? 0
  const canAddSection = sections.fields.length < maxSections

  const allIds = values.sections.flatMap((section) => section.productIds)
  const idsOutside = (sectionIndex: number) =>
    values.sections.flatMap((section, index) =>
      index === sectionIndex ? [] : section.productIds,
    )

  const setSectionIds = (sectionIndex: number, productIds: string[]) =>
    setValue(`sections.${sectionIndex}.productIds`, productIds, {
      shouldDirty: true,
    })

  if (!capability) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("flows.sendProducts.channelUnsupported")}
      </p>
    )
  }

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          handleSubmit((submitted) => {
            onSave(submitted)
            onOpenChange(false)
          })(event)
        }}
      >
        {displays.length > 1 && (
          <SelectField
            label={t("flows.sendProducts.display")}
            name="display"
            onValueChange={(next) => {
              if (next) {
                form.reset(
                  switchDisplay(getValues(), next as SendProductsDisplay),
                )
              }
            }}
            options={displays.map((display) => ({
              value: display,
              label: t(displayLabelKey[display]),
            }))}
            required
          />
        )}

        {isExpanded && fieldRules.header && (
          <div className="space-y-1">
            <InputField
              label={t("flows.sendProducts.header")}
              name="header"
              required={fieldRules.required.header}
            />
            <CharacterCount rule={fieldRules.header} value={values.header} />
            <IssueMessage issues={issues} path="header" />
          </div>
        )}

        {isExpanded && fieldRules.body && (
          <div className="space-y-1">
            <TextareaField
              label={t("flows.sendProducts.body")}
              name="body"
              required={fieldRules.required.body}
              rows={3}
            />
            <CharacterCount rule={fieldRules.body} value={values.body} />
            <IssueMessage issues={issues} path="body" />
          </div>
        )}

        {rule && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>{t("flows.sendProducts.products")}</Label>
              <span className="text-muted-foreground text-xs">
                {t("flows.sendProducts.productCount", {
                  count: productCount,
                  max: rule.maxProducts,
                })}
              </span>
            </div>
            {sections.fields.map((field, sectionIndex) => (
              <div
                className="flex flex-col gap-2 rounded-md border p-3"
                key={field.id}
              >
                {isExpanded && fieldRules.sectionTitle && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <InputField
                        name={`sections.${sectionIndex}.title`}
                        placeholder={t("flows.sendProducts.sectionTitle")}
                      />
                      {sections.fields.length > 1 && (
                        <Button
                          aria-label={t("flows.sendProducts.removeSection")}
                          onClick={() => sections.remove(sectionIndex)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <XIcon className="size-4" />
                        </Button>
                      )}
                    </div>
                    <CharacterCount
                      rule={fieldRules.sectionTitle}
                      value={values.sections[sectionIndex]?.title}
                    />
                    <IssueMessage
                      issues={issues}
                      path={`sections.${sectionIndex}.title`}
                    />
                  </div>
                )}
                <ProductMultiSelect
                  channel={channel}
                  excludeIds={idsOutside(sectionIndex)}
                  max={Math.max(
                    1,
                    rule.maxProducts -
                      (allIds.length -
                        (values.sections[sectionIndex]?.productIds.length ??
                          0)),
                  )}
                  onChange={(ids) => setSectionIds(sectionIndex, ids)}
                  value={values.sections[sectionIndex]?.productIds ?? []}
                />
                <IssueMessage
                  issues={issues}
                  path={`sections.${sectionIndex}.productIds`}
                />
              </div>
            ))}
            <IssueMessage issues={sectionLevelIssues} path="sections" />
            {isExpanded && isProductsDisplay && maxSections > 1 && (
              <Button
                disabled={!canAddSection}
                onClick={() => sections.append({ title: "", productIds: [] })}
                size="sm"
                type="button"
                variant="secondary"
              >
                <PlusIcon className="size-4" />
                {t("flows.sendProducts.addSection")}
              </Button>
            )}
          </div>
        )}

        {isExpanded && fieldRules.footer && (
          <div className="space-y-1">
            <InputField label={t("flows.sendProducts.footer")} name="footer" />
            <CharacterCount rule={fieldRules.footer} value={values.footer} />
            <IssueMessage issues={issues} path="footer" />
          </div>
        )}

        {canToggleExpanded && (
          <Button
            className="self-start"
            onClick={() => setIsExpandedByUser((current) => !current)}
            size="sm"
            type="button"
            variant="link"
          >
            {isExpandedByUser
              ? t("flows.sendProducts.fewerOptions")
              : t("flows.sendProducts.moreOptions")}
          </Button>
        )}

        <DialogFooter>
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button disabled={issues.length > 0} size="sm" type="submit">
            {t("actions.continue")}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  )
}

export function SendProductsDialog(props: SendProductsDialogProps) {
  const { open, onOpenChange, ...formProps } = props
  const t = useTranslations()
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.sendProducts")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("flows.sendProducts.description")}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form always starts from the step as it is now. */}
        {open && (
          <SendProductsForm {...formProps} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  )
}
