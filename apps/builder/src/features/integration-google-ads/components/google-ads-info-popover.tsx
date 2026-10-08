"use client"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { InfoIcon } from "lucide-react"
import type { ReactNode } from "react"

type GoogleAdsInfoPopoverProps = {
  /** Accessible name of the button, e.g. "About the order or event ID". */
  label: string
  children: ReactNode
}

/**
 * Small info button that opens longer guidance. A real `<button>` (focusable,
 * Enter / Space), unlike a hover-only tooltip on a bare icon, so the help is
 * reachable from the keyboard and on touch screens.
 */
export const GoogleAdsInfoPopover = ({
  label,
  children,
}: GoogleAdsInfoPopoverProps) => (
  <Popover>
    <PopoverTrigger
      aria-label={label}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
    >
      <InfoIcon aria-hidden="true" className="size-3.5" />
    </PopoverTrigger>
    <PopoverContent
      align="start"
      className="w-64 gap-1.5 text-muted-foreground text-xs leading-snug"
    >
      {children}
    </PopoverContent>
  </Popover>
)
