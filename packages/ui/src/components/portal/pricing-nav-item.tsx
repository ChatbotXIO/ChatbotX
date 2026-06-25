"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { Tag } from "lucide-react"

/**
 * The reseller pricing page is served from the reseller's verified custom
 * domain. `active` carries the resolved external URL; `missing` means no
 * verified domain yet, so the item prompts the reseller to set one up.
 */
export type PortalPricingState =
  | { state: "active"; url: string }
  | { state: "missing" }

type Props = {
  pricing: PortalPricingState
  /**
   * Where the "Add domain" CTA links to. A full path (incl. any `/portal`
   * prefix) so it works across Next.js zones.
   */
  customDomainHref: string
  title?: string
}

export function PortalPricingNavItem({
  pricing,
  customDomainHref,
  title = "Pricing Page",
}: Props) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          {pricing.state === "active" ? (
            <ActivePricingButton title={title} url={pricing.url} />
          ) : (
            <MissingDomainPricingButton
              customDomainHref={customDomainHref}
              title={title}
            />
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}

/** Shared row styling so the active and missing-domain states stay identical. */
const PRICING_ROW_CLASS =
  "flex w-full items-center gap-2 p-2 dark:text-gray-400"

function PricingRow({ title }: { title: string }) {
  return (
    <>
      <Tag className="size-5 shrink-0" />
      <span>{title}</span>
    </>
  )
}

function ActivePricingButton({ title, url }: { title: string; url: string }) {
  return (
    <SidebarMenuButton className="h-9 cursor-pointer p-0" tooltip={title}>
      <a
        className={PRICING_ROW_CLASS}
        href={url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <PricingRow title={title} />
      </a>
    </SidebarMenuButton>
  )
}

function MissingDomainPricingButton({
  title,
  customDomainHref,
}: {
  title: string
  customDomainHref: string
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <SidebarMenuButton className="h-9 cursor-pointer p-0" tooltip={title}>
          <span className={PRICING_ROW_CLASS}>
            <PricingRow title={title} />
          </span>
        </SidebarMenuButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Set up a custom domain first</AlertDialogTitle>
          <AlertDialogDescription>
            Your pricing page is served from your branded custom domain. Add and
            verify a custom domain to make it available to your customers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          {/* Plain anchor: the custom-domain page may live in another Next.js zone. */}
          <AlertDialogAction asChild>
            <a href={customDomainHref}>Add domain</a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
