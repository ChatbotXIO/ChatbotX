import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ReactNode } from "react"

export type AccountStatusItem = {
  id: string
  name: string
  secondary?: string
  leading?: ReactNode
}

type AccountStatusListProps<TItem extends AccountStatusItem> = {
  items: readonly TItem[]
  /** Per-row trailing area — a status `Badge` (+ inline Retry) in the dialog's connecting step, a `Switch` in `CoexistStep`'s popup. */
  renderTrailing: (item: TItem) => ReactNode
  className?: string
}

/**
 * The single row list both `ConnectManyDialog` steps render — one row per
 * selected account, in the order the operator selected. Same scroll
 * container class as the existing picker (`messenger-pages.tsx`) so 20 rows
 * scroll consistently, and `tabIndex={0}` so the list itself is reachable by
 * keyboard on mobile where individual rows may not all fit on screen.
 */
export function AccountStatusList<TItem extends AccountStatusItem>({
  items,
  renderTrailing,
  className,
}: AccountStatusListProps<TItem>) {
  return (
    <div
      className={cn(
        // `overflow-y-auto` alone computes the x axis to `auto` too — the
        // rows clip and truncate instead of scrolling sideways.
        "max-h-75 overflow-y-auto overflow-x-hidden pe-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:w-2",
        className,
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: intentional — a keyboard-focusable scroll region (plan §2.7: "20 rows can be scrolled with the keyboard on mobile"), not a real widget.
      tabIndex={0}
    >
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            className="flex items-center gap-3 rounded-lg border p-3"
            key={item.id}
          >
            {item.leading}
            <div className="min-w-0 flex-1">
              {/* Truncated text needs a `title`: the list clips horizontally,
                  so this is the only way back to the full name. */}
              <p className="truncate font-medium text-sm" title={item.name}>
                {item.name}
              </p>
              {item.secondary && (
                <p
                  className="truncate text-muted-foreground text-xs"
                  title={item.secondary}
                >
                  {item.secondary}
                </p>
              )}
            </div>
            {renderTrailing(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}
