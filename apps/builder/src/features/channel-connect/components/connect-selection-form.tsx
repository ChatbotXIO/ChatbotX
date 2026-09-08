"use client"

import { CheckboxGroupField } from "@chatbotx.io/ui/components/form/checkbox-group-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import { useCoexistSelection } from "../hooks/use-coexist-selection"
import { dropUnselectedCoexistIds } from "../lib/coexist-selection"
import type { MessageKey } from "../lib/message-key"
import type { ConnectPickerItem } from "../lib/picker-items"
import { selectAllState } from "../lib/select-all"
import { MAX_CONNECT_SELECTIONS, uniqueIds } from "../schema"
import { ConnectSelectionHeader } from "./connect-selection-header"

type ConnectSelectionFormValues = {
  selectedIds: string[]
  coexistIds: string[]
  aiReadsSyncedHistoryIds: string[]
}

/** What `onSubmit` receives: the picked ids under the caller's own field name, plus the coexist opt-in. Referenced through `ConnectSelectionFormProps` — callers infer it. */
type ConnectSelectionValues<TFieldName extends string> = Record<
  TFieldName,
  string[]
> & {
  /** Always a subset of the picked ids. */
  coexistIds: string[]
  /** Always a subset of `coexistIds`. */
  aiReadsSyncedHistoryIds: string[]
}

export type ConnectSelectionFormProps<TFieldName extends string> = {
  items: readonly ConnectPickerItem[]
  /** The key the caller's payload is keyed by, e.g. `"pageIds"`. */
  idsFieldName: TFieldName
  max?: number
  onSubmit: (values: ConnectSelectionValues<TFieldName>) => void | Promise<void>
  isSubmitting?: boolean
  onCancel?: () => void
  /**
   * Present only for coexist-eligible channels (`isCoexistChannel`) — callers
   * pass `CONNECT_CHANNEL_REGISTRY[channel].coexistDescriptionKey`. Absent, no
   * row carries a coexist switch and the submitted `coexistIds` stay empty.
   */
  coexist?: { descriptionKey: MessageKey }
}

/**
 * The picker's own form: the 1..max / no-duplicates rule plus the two coexist
 * id lists, all starting empty (every row's sync switch starts OFF).
 */
function useSelectionForm(max: number) {
  const t = useTranslations()
  const schema = z.object({
    selectedIds: uniqueIds(max, {
      min: t("channels.connectMany.validation.min"),
      max: t("channels.connectMany.validation.max", { max }),
      duplicate: t("channels.connectMany.validation.duplicate"),
    }),
    coexistIds: z.array(z.string()),
    aiReadsSyncedHistoryIds: z.array(z.string()),
  })
  return useForm<ConnectSelectionFormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      selectedIds: [],
      coexistIds: [],
      aiReadsSyncedHistoryIds: [],
    },
  })
}

/**
 * The submit payload: unselected rows drop out of BOTH coexist lists, and the
 * AI-reads list is additionally narrowed to the rows that still opted into
 * coexist — a row cannot ask the AI to read history it is not syncing.
 */
function toSelectionValues<TFieldName extends string>(
  idsFieldName: TFieldName,
  values: ConnectSelectionFormValues,
): ConnectSelectionValues<TFieldName> {
  const coexistIds = dropUnselectedCoexistIds(
    values.coexistIds,
    values.selectedIds,
  )
  return {
    [idsFieldName]: values.selectedIds,
    coexistIds,
    aiReadsSyncedHistoryIds: dropUnselectedCoexistIds(
      values.aiReadsSyncedHistoryIds,
      coexistIds,
    ),
    // Unavoidable: `idsFieldName` is a generic type parameter, so the computed
    // key cannot be proven to be the literal `TFieldName` this object type
    // requires. Every other field is checked normally.
  } as ConnectSelectionValues<TFieldName>
}

/** Cancel (when the caller offers one) plus the submit button. */
function SelectionFormFooter({
  isSubmitting,
  onCancel,
  selectedCount,
}: {
  isSubmitting: boolean
  onCancel?: () => void
  selectedCount: number
}) {
  const t = useTranslations()

  return (
    <div className="flex justify-end gap-2">
      {onCancel && (
        <Button onClick={onCancel} type="button" variant="ghost">
          {t("actions.cancel")}
        </Button>
      )}
      <Button disabled={selectedCount === 0 || isSubmitting} type="submit">
        {isSubmitting && <Loader2Icon className="animate-spin" />}
        {t("actions.continue")}
      </Button>
    </div>
  )
}

/**
 * The multi-select picker form shared by every channel's connect picker
 * (Messenger pages, Instagram accounts, WhatsApp numbers). Owns selection +
 * validation (`uniqueIds` — 1..max, no duplicates) and the per-row coexist
 * opt-in, and hands the caller exactly
 * `{ [idsFieldName]: string[]; coexistIds: string[]; aiReadsSyncedHistoryIds }`
 * on submit — the connect flow runs coexist per row after that row connects.
 */
export function ConnectSelectionForm<TFieldName extends string>({
  items,
  idsFieldName,
  max = MAX_CONNECT_SELECTIONS,
  onSubmit,
  isSubmitting: externalSubmitting,
  onCancel,
  coexist,
}: ConnectSelectionFormProps<TFieldName>) {
  const form = useSelectionForm(max)

  const selectedIds =
    useWatch({ control: form.control, name: "selectedIds" }) ?? []
  const coexistSelection = useCoexistSelection<ConnectSelectionFormValues>({
    control: form.control,
    names: {
      aiReadsSyncedHistoryIds: "aiReadsSyncedHistoryIds",
      coexistIds: "coexistIds",
      selectedIds: "selectedIds",
    },
    setValue: form.setValue,
  })

  const enabledIds = items
    .filter((item) => !item.disabled)
    .map((item) => item.id)
  const { allSelected, disabled, toggleAll } = selectAllState({
    ids: enabledIds,
    max,
    // Select-all only ever writes the selection — a row's coexist switch
    // stays where the operator left it (and unselected rows drop out above).
    onChange: (ids) =>
      form.setValue("selectedIds", ids, { shouldValidate: true }),
    selected: selectedIds,
  })
  const isSubmitting = externalSubmitting ?? form.formState.isSubmitting

  const handleSubmit = form.handleSubmit((values) =>
    onSubmit(toSelectionValues(idsFieldName, values)),
  )

  const options = items.map((item) => ({
    value: item.id,
    label: item.name,
    description: item.disabled ? item.disabledReason : item.secondary,
    disabled: item.disabled,
    leading: item.leading,
    trailing: coexist ? coexistSelection.trailingFor(item) : undefined,
  }))

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <ConnectSelectionHeader
          allSelected={allSelected}
          disabled={disabled}
          max={max}
          onToggleAll={toggleAll}
          selectedCount={selectedIds.length}
        />

        {/* `overflow-y-auto` alone computes the x axis to `auto` too, so a row
            whose trailing switch is wide enough would add a horizontal
            scrollbar — the rows clip and truncate instead. */}
        <div className="max-h-75 overflow-y-auto overflow-x-hidden pe-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:w-2">
          <CheckboxGroupField<ConnectSelectionFormValues>
            name="selectedIds"
            options={options}
          />
        </div>

        {coexist && coexistSelection.panel(coexist.descriptionKey)}

        <SelectionFormFooter
          isSubmitting={isSubmitting}
          onCancel={onCancel}
          selectedCount={selectedIds.length}
        />
      </form>
    </Form>
  )
}
