"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"

type JackpotStartButtonProps = {
  label: string
  startButtonImageUrl: string
  onClick?: () => void
  disabled?: boolean
}

export function JackpotStartButton({
  label,
  startButtonImageUrl,
  onClick,
  disabled,
}: JackpotStartButtonProps) {
  if (startButtonImageUrl) {
    return (
      <button
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {/* biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded button image, not an optimizable static asset */}
        <img
          alt={label}
          className="h-10 w-40 object-contain"
          height={40}
          src={startButtonImageUrl}
          width={160}
        />
      </button>
    )
  }

  return (
    <Button
      className="w-40 rounded-full bg-white text-black shadow-md hover:bg-white/90"
      disabled={disabled}
      onClick={onClick}
      size="lg"
      type="button"
    >
      {label}
    </Button>
  )
}
