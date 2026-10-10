"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import { ChevronRightIcon } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"

type GoogleAdsFieldDisclosureProps = {
  label: string
  /** Text appended to the label when `count` fields are set (omitted at zero). */
  countLabel: (count: number) => string
  /** The form fields the section holds; they drive the count and the error. */
  names: string[]
  contentClassName: string
  children: ReactNode
}

const isFilled = (value: unknown): boolean =>
  typeof value === "string" && value.trim() !== ""

/**
 * Collapsed disclosure over a few template fields. It opens on mount when one
 * holds a value or an error, and whenever a new error appears (e.g. after a
 * failed save); otherwise only the user toggles it, so it may be collapsed with
 * a value set.
 */
export const GoogleAdsFieldDisclosure = ({
  label,
  countLabel,
  names,
  contentClassName,
  children,
}: GoogleAdsFieldDisclosureProps) => {
  const { control, getFieldState, getValues } = useFormContext()
  const formState = useFormState({ control, name: names })
  const hasError = names.some((name) =>
    Boolean(getFieldState(name, formState).error),
  )
  const values: unknown[] = useWatch({ control, name: names })
  const count = values.filter(isFilled).length

  const [open, setOpen] = useState(
    () => names.some((name) => isFilled(getValues(name))) || hasError,
  )
  const hadErrorRef = useRef(hasError)
  useEffect(() => {
    if (hasError && !hadErrorRef.current) {
      setOpen(true)
    }
    hadErrorRef.current = hasError
  }, [hasError])

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group flex items-center gap-1 text-muted-foreground text-sm">
        <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90 motion-reduce:transition-none rtl:rotate-180 rtl:group-data-[panel-open]:rotate-90" />
        {label}
        {count > 0 ? ` · ${countLabel(count)}` : null}
      </CollapsibleTrigger>
      <CollapsibleContent className={contentClassName} keepMounted>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
