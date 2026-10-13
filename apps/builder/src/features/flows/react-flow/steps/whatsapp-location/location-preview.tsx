import { isWhatsappLocationUnset } from "@chatbotx.io/flow-config"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { MapPinIcon } from "lucide-react"
import type { ReactNode } from "react"

const COORDINATE_DECIMALS = 5

const formatCoordinate = (value: number) =>
  Number.isFinite(value) ? value.toFixed(COORDINATE_DECIMALS) : "—"

type LocationPreviewProps = {
  name?: string
  address?: string
  latitude: number
  longitude: number
  /** Shown instead of the name while the step has no name or no location. */
  fallbackTitle: ReactNode
  className?: string
}

/**
 * Compact preview of a location message: an icon chip next to the place name,
 * address and coordinates. Uses the same bubble surface as the other message
 * steps. Shared by the node viewer and the inline editor.
 */
export function LocationPreview({
  name,
  address,
  latitude,
  longitude,
  fallbackTitle,
  className,
}: LocationPreviewProps) {
  const isUnset = isWhatsappLocationUnset({ latitude, longitude })
  const title = isUnset ? fallbackTitle : name || fallbackTitle

  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-secondary px-3 py-2.5",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/10"
      >
        <MapPinIcon className="size-4 text-foreground/70" />
      </span>
      <div className="flex min-w-0 flex-col">
        <p className="truncate font-medium text-sm leading-tight">{title}</p>
        {address && !isUnset ? (
          <p className="truncate text-muted-foreground text-xs leading-tight">
            {address}
          </p>
        ) : null}
        {isUnset ? null : (
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80 tabular-nums">
            {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
          </p>
        )}
      </div>
    </div>
  )
}
