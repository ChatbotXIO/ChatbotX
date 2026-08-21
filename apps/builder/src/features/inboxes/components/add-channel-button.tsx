"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ReactElement } from "react"

type AddChannelButtonProps = {
  /** Localized channel label, e.g. `t("fields.whatsapp.label")`. */
  readonly label: string
  /** Where the enabled button navigates. Omit when `render` is supplied. */
  readonly href?: string
  /**
   * Dialog-owned trigger. When `canCreate` is false the disabled button is
   * rendered *instead*, so the dialog can never be opened.
   */
  readonly render?: ReactElement
  /**
   * Whether channel-visibility policy still allows creating this channel.
   * Defaults to `true` so call sites not yet wired to channel-visibility keep
   * today's behavior — same convention as `visibleChannels` / `offeredChannels`.
   */
  readonly canCreate?: boolean
}

export function AddChannelButton({
  label,
  href,
  render,
  canCreate = true,
}: AddChannelButtonProps) {
  const t = useTranslations()
  const content = (
    <>
      <PlusCircleIcon className="h-4 w-4" />
      {t("actions.addFeature", { feature: label })}
    </>
  )

  if (!canCreate) {
    // A <Link> has no disabled state, so this branch drops the anchor
    // entirely rather than aria-disabled-ing it — aria-disabled +
    // pointer-events-none would still leave the href middle-clickable,
    // copyable, and reachable from a screen reader's link list. The <span>
    // wrapper keeps the tooltip hoverable: a disabled native button
    // swallows pointer events, so the trigger has to sit on a non-disabled
    // ancestor.
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button disabled={true} size="sm" variant="secondary">
                {content}
              </Button>
            </span>
          }
        />
        <TooltipContent>
          {t("platformChannels.hiddenByPlatform")}
        </TooltipContent>
      </Tooltip>
    )
  }

  if (render) {
    return render
  }

  return (
    <Link
      className={buttonVariants({ size: "sm", variant: "secondary" })}
      href={href ?? "#"}
    >
      {content}
    </Link>
  )
}
