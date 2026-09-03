"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import {
  defaultEventNameByCatalog,
  eventNamesByCatalog,
  metaCapiActionSourcePolicy,
  metaCapiActionSourceValues,
  metaCapiContentTypeValues,
} from "@chatbotx.io/utils/meta-capi"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import {
  buildEventOptions,
  CUSTOM_EVENT_OPTION,
  isEventNameAllowedForActionSource,
} from "../lib/event-catalog-options"
import {
  getMetaCapiActionSourceLabel,
  getMetaCapiContentTypeLabel,
  META_CAPI_ACTION_SOURCE_DOCS_URL,
} from "../lib/event-label"
import { resolveMetaCapiActionSource } from "../lib/resolve-action-source"

type MetaCapiEventFieldsProps = {
  parentName: string
}

/**
 * Shared field set for the flow-step dialog (`MetaCapiEventDialog`) and the
 * trigger action editor — one body, two hosts. The event catalog (and
 * whether a custom name is offered) is driven entirely by `actionSource`
 * via `metaCapiActionSourcePolicy`; changing the action source re-validates
 * the current event name and resets it to the new catalog's default when it
 * is no longer allowed.
 */
export const MetaCapiEventFields = ({
  parentName,
}: MetaCapiEventFieldsProps) => {
  const t = useTranslations()
  const { control, setValue, getValues } = useFormContext()

  // The dialog's child form uses this field set at its root (`parentName ===
  // ""`); the trigger action editor nests it under the action's own path.
  // Support both without a leading-dot field-path bug.
  const fieldName = (suffix: string) =>
    parentName ? `${parentName}.${suffix}` : suffix

  // Flow versions saved before `actionSource`/`eventName` existed on this
  // step/action carry no value for them at all, and the dialog restores the
  // parent's raw value into this form (no zod defaults applied) — so a
  // legacy step would otherwise open with a blank action-source select and
  // no default event selected. Back-fill both once, on mount only, so the
  // dialog opens pre-selected the way a brand-new step would.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount only, to back-fill legacy values without clobbering later edits
  useEffect(() => {
    const storedActionSource = resolveMetaCapiActionSource(
      getValues(fieldName("actionSource")),
    )
    if (getValues(fieldName("actionSource")) === undefined) {
      setValue(fieldName("actionSource"), storedActionSource, {
        shouldDirty: false,
      })
    }
    if (!getValues(fieldName("eventName"))) {
      const { eventCatalog } = metaCapiActionSourcePolicy[storedActionSource]
      setValue(
        fieldName("eventName"),
        defaultEventNameByCatalog[eventCatalog],
        {
          shouldDirty: false,
        },
      )
    }
  }, [])

  const actionSource = resolveMetaCapiActionSource(
    useWatch({ control, name: fieldName("actionSource") }),
  )
  const eventName: string =
    useWatch({ control, name: fieldName("eventName") }) ?? ""

  const policy = metaCapiActionSourcePolicy[actionSource]
  const catalogNames = useMemo(
    () => new Set(eventNamesByCatalog[policy.eventCatalog]),
    [policy.eventCatalog],
  )
  const isCustomEvent =
    policy.allowsCustomEventNames && !catalogNames.has(eventName)

  const actionSourceOptions = useMemo(
    () =>
      metaCapiActionSourceValues.map((value) => ({
        value,
        label: getMetaCapiActionSourceLabel(value, t),
      })),
    [t],
  )

  const contentTypeOptions = useMemo(
    () =>
      metaCapiContentTypeValues.map((value) => ({
        value,
        label: getMetaCapiContentTypeLabel(value, t),
      })),
    [t],
  )

  const catalogEventOptions = useMemo(
    () => buildEventOptions(actionSource, t),
    [actionSource, t],
  )

  // The "Custom event…" sentinel is never stored. While a custom name is
  // active, its option `value` is swapped to the real (possibly still
  // empty) `eventName` so `ComboboxField`'s field-value lookup resolves to
  // it and keeps showing "Custom event…" as selected as the user types.
  const eventOptions = useMemo(
    () =>
      isCustomEvent
        ? catalogEventOptions.map((option) =>
            option.value === CUSTOM_EVENT_OPTION
              ? { ...option, value: eventName }
              : option,
          )
        : catalogEventOptions,
    [catalogEventOptions, isCustomEvent, eventName],
  )

  const handleActionSourceChange = (nextValue?: string) => {
    if (!nextValue) {
      return
    }
    const nextActionSource = resolveMetaCapiActionSource(nextValue)
    const currentEventName = getValues(fieldName("eventName"))

    if (isEventNameAllowedForActionSource(currentEventName, nextActionSource)) {
      return
    }

    const nextPolicy = metaCapiActionSourcePolicy[nextActionSource]
    setValue(
      fieldName("eventName"),
      defaultEventNameByCatalog[nextPolicy.eventCatalog],
      { shouldDirty: true, shouldValidate: true },
    )
  }

  // Picking "Custom event…" clears the name so the user can type one; the
  // empty value is only validated on submit (or once they start typing), not
  // the instant the option is chosen. The custom-name input owns the error
  // display for that field while it is visible.
  const handleEventSelect = (value: string) => {
    const isCustomSelection = value === CUSTOM_EVENT_OPTION
    setValue(fieldName("eventName"), isCustomSelection ? "" : value, {
      shouldDirty: true,
      shouldValidate: !isCustomSelection,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          hideMessage={isCustomEvent}
          label={t("metaConversions.fields.eventType.label")}
          name={fieldName("eventName")}
          options={eventOptions}
          placeholder={t("actions.pleaseSelect")}
          required
          triggerValueChange={handleEventSelect}
        />
        <SelectField
          description={t("metaConversions.actionSource.help")}
          descriptionHref={META_CAPI_ACTION_SOURCE_DOCS_URL}
          descriptionType="tooltip"
          label={t("metaConversions.actionSource.label")}
          name={fieldName("actionSource")}
          options={actionSourceOptions}
          required
          triggerValueChange={handleActionSourceChange}
        />
      </div>

      {isCustomEvent ? (
        <InputField
          label={t("metaConversions.fields.customEventName")}
          maxLength={50}
          name={fieldName("eventName")}
          placeholder={t("metaConversions.fields.customEventNamePlaceholder")}
          required
        />
      ) : null}

      <SelectField
        allowClear
        label={t("metaConversions.fields.contentType.label")}
        name={fieldName("contentType")}
        options={contentTypeOptions}
      />

      <PlainTextEditorField
        includeBotFieldVariables
        inline
        label={t("metaConversions.fields.contentIds")}
        name={fieldName("contentIds")}
        placeholder={t("metaConversions.fields.contentIdsPlaceholder")}
        showEmojiPicker={false}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <PlainTextEditorField
          includeBotFieldVariables
          inline
          label={t("metaConversions.fields.currency")}
          name={fieldName("currency")}
          placeholder={t("metaConversions.fields.currencyPlaceholder")}
          showEmojiPicker={false}
        />
        <PlainTextEditorField
          includeBotFieldVariables
          inline
          label={t("metaConversions.fields.value")}
          name={fieldName("value")}
          placeholder={t("metaConversions.fields.valuePlaceholder")}
          showEmojiPicker={false}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t("metaConversions.flowStep.whatsappNote")}
      </p>

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-sm">
          <ChevronDownIcon className="size-4" />
          {t("metaConversions.dialog.advanced")}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-3">
          <InputField
            label={t("metaConversions.fields.contentCategory")}
            maxLength={200}
            name={fieldName("contentCategory")}
            placeholder={t("metaConversions.fields.contentCategoryPlaceholder")}
          />
          <InputField
            label={t("metaConversions.fields.contentName")}
            maxLength={200}
            name={fieldName("contentName")}
            placeholder={t("metaConversions.fields.contentNamePlaceholder")}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
