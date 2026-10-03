"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useId } from "react"

// Instagram's squircle and glyph, shared by both background layers.
const INSTAGRAM_SQUIRCLE_PATH =
  "M66 0C38.86 0 30.92.03 29.38.16c-5.57.46-9.04 1.34-12.81 3.22-2.91 1.45-5.21 3.12-7.47 5.47C4.97 13.13 2.47 18.39 1.57 24.66 1.13 27.7 1 28.32.97 43.85c-.01 5.17 0 11.99 0 21.12 0 27.13.03 35.06.16 36.6.45 5.41 1.3 8.82 3.1 12.55 3.44 7.14 10.01 12.5 17.75 14.51 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.21 6.95-.55 9.78-1.28 7.79-2.01 14.24-7.3 17.75-14.53 1.77-3.64 2.66-7.18 3.07-12.32.09-1.12.12-18.98.12-36.81 0-17.84-.04-35.66-.13-36.78-.41-5.22-1.3-8.73-3.12-12.44-1.5-3.04-3.16-5.31-5.57-7.63C117.87 4 112.61 1.5 106.34.6 103.3.16 102.7.03 87.16 0H66z"

const INSTAGRAM_GLYPH_PATH =
  "M66 18c-13.04 0-14.67.06-19.79.29-5.11.23-8.6 1.04-11.65 2.23-3.16 1.23-5.84 2.87-8.5 5.54-2.67 2.66-4.31 5.34-5.54 8.5-1.19 3.05-2 6.54-2.23 11.65-.23 5.12-.29 6.76-.29 19.79s.06 14.67.29 19.79c.23 5.11 1.04 8.6 2.23 11.65 1.23 3.16 2.87 5.83 5.54 8.5 2.66 2.67 5.34 4.32 8.5 5.54 3.05 1.19 6.54 2 11.65 2.23 5.12.23 6.76.29 19.79.29 13.04 0 14.67-.06 19.79-.29 5.11-.23 8.6-1.04 11.65-2.23 3.16-1.23 5.83-2.87 8.5-5.54 2.67-2.67 4.31-5.34 5.54-8.5 1.18-3.05 1.99-6.54 2.23-11.65.23-5.12.29-6.75.29-19.79 0-13.03-.06-14.67-.29-19.79-.24-5.11-1.05-8.6-2.23-11.65-1.23-3.16-2.87-5.83-5.54-8.5-2.67-2.67-5.34-4.31-8.5-5.54-3.06-1.18-6.55-2-11.66-2.23-5.12-.23-6.75-.29-19.79-.29zm-4.31 8.65c1.28 0 2.7 0 4.31 0 12.81 0 14.33.05 19.39.28 4.68.21 7.22 1 8.91 1.65 2.24.87 3.84 1.91 5.52 3.59 1.68 1.68 2.72 3.28 3.59 5.52.66 1.69 1.44 4.23 1.65 8.91.23 5.06.28 6.58.28 19.39s-.05 14.33-.28 19.39c-.21 4.68-1 7.22-1.65 8.91-.87 2.24-1.92 3.84-3.59 5.52-1.68 1.68-3.28 2.72-5.52 3.59-1.69.66-4.23 1.44-8.91 1.65-5.06.23-6.58.28-19.4.28-12.81 0-14.33-.05-19.39-.28-4.68-.22-7.22-1-8.91-1.65-2.24-.88-3.84-1.92-5.52-3.6-1.68-1.67-2.72-3.27-3.59-5.51-.66-1.69-1.44-4.23-1.66-8.91-.23-5.06-.27-6.58-.27-19.4s.04-14.33.27-19.39c.22-4.68 1-7.22 1.66-8.91.87-2.24 1.91-3.84 3.59-5.52 1.68-1.68 3.28-2.72 5.52-3.59 1.69-.66 4.23-1.44 8.91-1.66 4.43-.2 6.15-.26 15.09-.27zm29.93 7.97c-3.18 0-5.76 2.58-5.76 5.76 0 3.18 2.58 5.76 5.76 5.76 3.18 0 5.76-2.58 5.76-5.76 0-3.18-2.58-5.76-5.76-5.76zm-25.62 6.73c-13.62 0-24.65 11.04-24.65 24.65 0 13.62 11.03 24.65 24.65 24.65 13.61 0 24.65-11.03 24.65-24.65 0-13.61-11.04-24.65-24.65-24.65zm0 8.65c8.83 0 16 7.16 16 16 0 8.84-7.17 16-16 16-8.84 0-16-7.16-16-16 0-8.84 7.16-16 16-16z"

export function InstagramTileIcon() {
  // Unique per render: two of these on one dialog step would otherwise share
  // gradient ids and the second would render without its fill.
  const id = useId()
  const baseId = `${id}-base`
  const blueId = `${id}-blue`
  const bgRadialId = `${id}-bg`
  const blueRadialId = `${id}-blue-radial`
  return (
    <svg
      aria-hidden="true"
      className="size-12"
      viewBox="0 0 132 132"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={baseId}>
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="1" stopColor="#C837AB" />
        </linearGradient>
        <linearGradient id={blueId}>
          <stop offset="0" stopColor="#3771C8" />
          <stop offset="0.128" stopColor="#3771C8" />
          <stop offset="1" stopColor="#6600FF" stopOpacity="0" />
        </linearGradient>
        <radialGradient
          cx="158.429"
          cy="578.088"
          gradientTransform="matrix(0 -1.98198 1.8439 0 -1031.402 454.004)"
          gradientUnits="userSpaceOnUse"
          href={`#${baseId}`}
          id={bgRadialId}
          r="65"
        />
        <radialGradient
          cx="147.694"
          cy="473.455"
          gradientTransform="matrix(0.17394 0.86872 -3.5818 0.71718 1648.348 -458.493)"
          gradientUnits="userSpaceOnUse"
          href={`#${blueId}`}
          id={blueRadialId}
          r="65"
        />
      </defs>
      <path d={INSTAGRAM_SQUIRCLE_PATH} fill={`url(#${bgRadialId})`} />
      <path d={INSTAGRAM_SQUIRCLE_PATH} fill={`url(#${blueRadialId})`} />
      <path d={INSTAGRAM_GLYPH_PATH} fill="#FFFFFF" />
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
  const gradientId = useId()
  return (
    <svg
      aria-hidden="true"
      className="size-12"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#FF4D67" />
          <stop offset="100%" stopColor="#E41E3F" />
        </linearGradient>
      </defs>
      <rect fill={`url(#${gradientId})`} height="48" rx="12" width="48" />
      <rect fill="#FFFFFF" height="18" rx="3.5" width="17" x="11" y="15" />
      <path
        d="M29 21.4L35.2 16.7C35.8 16.2 37 16.7 37 17.6V30.4C37 31.3 35.8 31.8 35.2 31.3L29 26.6V21.4Z"
        fill="#FFFFFF"
      />
      <circle cx="17.5" cy="24" fill="#E41E3F" r="2.2" />
      <path
        d="M17.5 18.5C20.5 18.5 23 21 23 24C23 27 20.5 29.5 17.5 29.5"
        fill="none"
        stroke="#E41E3F"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
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
