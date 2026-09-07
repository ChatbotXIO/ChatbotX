"use client"

import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"

const SELECT_ALL_LABEL_ID = "connect-select-all-label"

export type ConnectSelectionHeaderProps = {
  /** Whether every selectable row (capped at `max`) is currently selected. */
  allSelected: boolean
  /** Disabled when there is nothing selectable at all. */
  disabled: boolean
  onToggleAll: (checked: boolean) => void
  selectedCount: number
  max: number
}

/**
 * The select-all checkbox + selected-count counter shared by every
 * multi-select connect picker (`ConnectSelectionForm` for Messenger/
 * Instagram, WhatsApp's own `PhoneNumberSelectionSection`). Extracted from
 * `ConnectSelectionForm` so a channel that assembles its own picker section
 * around a differently-scoped form (WhatsApp's `phoneNumberIds` field lives
 * on the shared connect form, not a standalone one) can still reuse the exact
 * same header instead of re-implementing it.
 */
export function ConnectSelectionHeader({
  allSelected,
  disabled,
  onToggleAll,
  selectedCount,
  max,
}: ConnectSelectionHeaderProps) {
  const t = useTranslations()
  // Base UI renders the checkbox as a `<span role="checkbox">`, which no
  // `<label for>` can activate — so the text toggles select-all itself and
  // is linked back for assistive tech through `aria-labelledby`.
  const toggleFromText = () => {
    if (!disabled) {
      onToggleAll(!allSelected)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          aria-labelledby={SELECT_ALL_LABEL_ID}
          checked={allSelected}
          disabled={disabled}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
        />
        {/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard access lives on the checkbox this text labels; the text is a pointer-only click target. */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — the checkbox owns focus and key handling. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: same — the checkbox owns focus and key handling. */}
        <span
          className={cn(
            "select-none font-medium text-sm",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          id={SELECT_ALL_LABEL_ID}
          onClick={toggleFromText}
        >
          {t("channels.connectMany.selectAll")}
        </span>
      </div>
      <span className="text-muted-foreground text-xs">
        {t("channels.connectMany.selected", { count: selectedCount, max })}
      </span>
    </div>
  )
}
