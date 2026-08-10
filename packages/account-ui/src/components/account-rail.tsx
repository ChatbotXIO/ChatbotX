import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

export type AccountRailItem = {
  /** Stable React key. */
  key: string
  /** Pre-resolved, already-translated label. */
  label: string
  href: string
  icon: LucideIcon
  /**
   * Render as a plain anchor instead of `next/link`. Required when the target
   * lives in a different Next.js zone (the OSS builder's `/portal/*` links,
   * the portal's absolute cross-zone dashboard link): `next/link` prefetch is
   * wasted and client-side navigation would fail. Mirrors `NavMain`'s
   * `crossZone` prop in `@chatbotx.io/ui/components/portal/nav-main`.
   */
  external?: boolean
}

export type AccountRailUser = {
  /** Pre-resolved display name. Callers apply their own name/email fallback. */
  displayName: string
  email: string
  /** Pre-resolved absolute avatar URL, or "" to fall back to initials. */
  avatarUrl: string
}

export type AccountRailProps = {
  user: AccountRailUser
  /**
   * Overlay rendered inside the (relative) identity header — e.g. an
   * edit-profile trigger. When omitted the header is not made `relative`,
   * matching the markup of a caller with no such affordance.
   */
  headerAction?: ReactNode
  /**
   * Plan name, upgrade CTA, usage bars, and trial/past-due notice. Fully
   * app-owned: callers differ on translation namespace, upgrade affordance,
   * metric shape, and whether the section is gated behind an edition check.
   * Omit to render no plan section.
   */
  planBlock?: ReactNode
  /** Bottom-anchored nav links. Callers pre-filter; the shell renders all of them. */
  items: AccountRailItem[]
  /** Sign-out control, owned by the caller (each app has its own). */
  footer: ReactNode
  className?: string
}

export const accountRailMenuItemClassName =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0"

/**
 * The account-navigation shell shared by the OSS builder and the enterprise
 * portal: identity, an optional plan/usage block, bottom-anchored nav links,
 * and a footer slot for sign-out. Server-safe by design — no hooks, no
 * `"use client"` — so both apps can render it from an async server component
 * and pass client-only subtrees (upgrade dialogs, edit-profile, sign-out) in
 * as children.
 */
export function AccountRail({
  user,
  headerAction,
  planBlock,
  items,
  footer,
  className,
}: AccountRailProps) {
  const initials = user.displayName.slice(0, 2).toUpperCase()

  return (
    // `md:top-8` must match the host page's row padding (e.g. a `py-8`
    // wrapper, i.e. 2rem), and the calc subtrahend must be 2x that value (top
    // inset + matching bottom inset). `md:h-` (not `md:max-h-`) is
    // deliberate: the rail is always full column height, sticky, and scrolls
    // internally once content overflows — do not swap this back to `max-h`.
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col rounded-xl border bg-card md:sticky md:top-8 md:h-[calc(100vh-4rem)] md:w-72",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-6 md:pb-2">
        <div
          className={cn("flex items-center gap-3", headerAction && "relative")}
        >
          <Avatar className="size-11">
            <AvatarImage alt={user.displayName} src={user.avatarUrl} />
            <AvatarFallback className="rounded-full text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate font-semibold text-sm">
              {user.displayName}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {user.email}
            </span>
          </div>
          {headerAction}
        </div>

        {planBlock}

        {/*
          `mt-auto` is the layout's single flexible spacer — it pushes this
          menu block to the bottom of the scrollable body instead of sitting
          right under the plan/usage block. Exactly one `mt-auto` must exist
          in this component (and `planBlock` must not add a second), or the
          free space splits and a dead gap reopens above the footer.
        */}
        <div className="mt-auto flex flex-col gap-1 border-t pt-4">
          {items.map(({ key, label, href, icon: Icon, external }) => {
            const content = (
              <>
                <Icon aria-hidden className="size-4" />
                {label}
              </>
            )
            return external ? (
              <a className={accountRailMenuItemClassName} href={href} key={key}>
                {content}
              </a>
            ) : (
              <Link
                className={accountRailMenuItemClassName}
                href={href}
                key={key}
              >
                {content}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="border-t p-6 pt-4">{footer}</div>
    </aside>
  )
}
