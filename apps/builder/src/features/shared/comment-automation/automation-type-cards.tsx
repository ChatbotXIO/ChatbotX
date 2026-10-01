"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Video } from "lucide-react"
import Link from "next/link"
import { useId } from "react"

export function InstagramTileIcon() {
  // Unique per render: two of these on one dialog step would otherwise share
  // a gradient id and the second would render without its fill.
  const gradientId = useId()
  return (
    <svg
      aria-hidden="true"
      className="size-12"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient
          cx="30%"
          cy="107%"
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          r="150%"
        >
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect fill={`url(#${gradientId})`} height="24" rx="6" width="24" />
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" fill="white" r="1.2" />
    </svg>
  )
}

export function FacebookTileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-12"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#1877F2" height="24" rx="6" width="24" />
      <path
        d="M16 8h-2a1 1 0 0 0-1 1v2h3l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2v3z"
        fill="white"
      />
    </svg>
  )
}

export function LiveTileIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex size-12 items-center justify-center rounded-xl bg-red-500 text-white"
    >
      <Video className="size-7" />
    </span>
  )
}

type AutomationTypeCardAction =
  | { href: string; onSelect?: never }
  | { onSelect: () => void; href?: never }

/**
 * One option on a "pick what to automate" dialog step: icon, title,
 * description and a Continue button that either navigates or advances the
 * dialog.
 */
export function AutomationTypeCard({
  icon,
  title,
  description,
  continueLabel,
  ...action
}: {
  icon: React.ReactNode
  title: string
  description: string
  continueLabel: string
} & AutomationTypeCardAction) {
  const buttonClassName = buttonVariants({
    variant: "secondary",
    className: "w-full",
  })
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center">
      {icon}
      <h3 className="font-semibold">{title}</h3>
      <p className="flex-1 text-muted-foreground text-sm">{description}</p>
      {action.href === undefined ? (
        <button
          className={buttonClassName}
          onClick={action.onSelect}
          type="button"
        >
          {continueLabel}
        </button>
      ) : (
        <Link className={buttonClassName} href={action.href}>
          {continueLabel}
        </Link>
      )}
    </div>
  )
}

export function AutomationTypeCardGrid({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}
