"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import Link from "next/link"
import { useSelectedLayoutSegment } from "next/navigation"
import type { ReactNode } from "react"

type RouteAccordionItem = {
  /** Route segment under `basePath` — also the accordion value. */
  readonly value: string
  /** Trigger row content. */
  readonly label: ReactNode
}

type RouteAccordionShellProps = {
  /** Absolute path the item segments nest under (no trailing slash). */
  readonly basePath: string
  /** The active segment's page, rendered inside its open panel. */
  readonly children?: ReactNode
  readonly items: readonly RouteAccordionItem[]
}

/**
 * Route-driven accordion shared by the settings channels and integrations
 * lists: each row is a real route (`<basePath>/<value>`), so opening a panel
 * client-side navigates to that row's page and only that page's server/client
 * graph loads. Exactly one panel (the active segment) can be open; the index
 * route renders all rows collapsed. `prefetch={false}` is required — eager
 * prefetch of every row's route would re-create the one-big-bundle problem
 * this replaces.
 */
export function RouteAccordionShell({
  basePath,
  children,
  items,
}: RouteAccordionShellProps) {
  const activeSegment = useSelectedLayoutSegment()

  return (
    <Accordion className="w-full" value={activeSegment ? [activeSegment] : []}>
      {items.map((item) => {
        const isActive = item.value === activeSegment
        return (
          <AccordionItem key={item.value} value={item.value}>
            <AccordionTrigger
              className="rounded-none px-4 transition-all hover:bg-muted hover:no-underline data-[panel-open]:bg-muted"
              nativeButton={false}
              render={
                <Link
                  href={isActive ? basePath : `${basePath}/${item.value}`}
                  prefetch={false}
                  scroll={false}
                />
              }
            >
              {item.label}
            </AccordionTrigger>
            <AccordionContent className="p-4">
              {isActive ? children : null}
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}
