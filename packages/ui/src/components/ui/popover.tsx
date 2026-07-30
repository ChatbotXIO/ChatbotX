"use client"

import type * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@chatbotx.io/ui/lib/utils"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  anchor,
  portal = true,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof PopoverPrimitive.Positioner>,
    "align" | "alignOffset" | "side" | "sideOffset" | "anchor"
  > & {
    portal?: boolean
  }) {
  const popoverContent = (
    <PopoverPrimitive.Positioner
      align={align}
      anchor={anchor}
      sideOffset={sideOffset}
      className="isolate z-50"
    >
      <PopoverPrimitive.Popup
        data-slot="popover-content"
        className={cn(
          "bg-popover text-popover-foreground data-starting-style:opacity-0 data-ending-style:opacity-0 data-starting-style:scale-95 data-ending-style:scale-95 transition-[transform,opacity] w-72 max-h-(--available-height) origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className,
        )}
        onWheel={(e) => {
          e.stopPropagation();
        }}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  )

  return (
    portal ? (
      <PopoverPrimitive.Portal>
        {popoverContent}
      </PopoverPrimitive.Portal>
    ) : (
      popoverContent
    )
  )
}

export { Popover, PopoverTrigger, PopoverContent }
