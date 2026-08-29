"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useState } from "react"

type JackpotStartButtonProps = {
  label: string
  startButtonImageUrl: string
  onClick?: () => void
  disabled?: boolean
}

const PUNCH_DURATION_MS = 500

const PUNCH_STYLE = `
  @keyframes jackpotButtonPunch {
    0% { transform: scale(1); }
    40% { transform: scale(0.82); }
    100% { transform: scale(1); }
  }
  .jackpot-btn-punch {
    animation: jackpotButtonPunch ${PUNCH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
`

export function JackpotStartButton({
  label,
  startButtonImageUrl,
  onClick,
  disabled,
}: JackpotStartButtonProps) {
  const [punchTick, setPunchTick] = useState(0)

  const handleClick = () => {
    setPunchTick((tick) => tick + 1)
    onClick?.()
  }

  const punchClassName = punchTick > 0 ? "jackpot-btn-punch" : undefined

  if (startButtonImageUrl) {
    return (
      <>
        <style>{PUNCH_STYLE}</style>
        <button
          aria-label={label}
          className="relative"
          disabled={disabled}
          onClick={handleClick}
          type="button"
        >
          {/* biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded button image, not an optimizable static asset */}
          <img
            alt={label}
            className={cn("h-10 w-40 object-contain", punchClassName)}
            height={40}
            key={punchTick}
            src={startButtonImageUrl}
            width={160}
          />
        </button>
      </>
    )
  }

  return (
    <>
      <style>{PUNCH_STYLE}</style>
      <Button
        className={cn(
          "w-40 rounded-full bg-white text-black shadow-md hover:bg-white/90",
          punchClassName,
        )}
        disabled={disabled}
        key={punchTick}
        onClick={handleClick}
        size="lg"
        type="button"
      >
        {label}
      </Button>
    </>
  )
}
