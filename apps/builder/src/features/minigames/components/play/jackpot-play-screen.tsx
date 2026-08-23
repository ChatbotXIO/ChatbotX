"use client"

import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type {
  MinigameContactModel,
  MinigameModel,
} from "@chatbotx.io/database/types"
import { JackpotMachineArt, JackpotStartButton } from "@chatbotx.io/minigame-ui"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { CircleHelpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { playMinigameAction } from "../../actions/play-minigame.action"

type JackpotPlayScreenProps = {
  minigame: MinigameModel
  contactState: MinigameContactModel
  token: string
}

const SPIN_SYMBOLS = ["7", "🍒", "🍋", "⭐", "🔔", "BAR"]
const SPIN_INTERVAL_MS = 100
const REEL_STOP_DELAYS_MS: [number, number, number] = [1200, 3200, 5200]
const WIN_SYMBOLS: [string, string, string] = ["7", "7", "7"]

function randomSymbol(): string {
  return SPIN_SYMBOLS[Math.floor(Math.random() * SPIN_SYMBOLS.length)]
}

function setAtIndex<T>(tuple: [T, T, T], index: number, value: T): [T, T, T] {
  const next: [T, T, T] = [...tuple]
  next[index] = value
  return next
}

function pickMismatchedSymbols(): [string, string, string] {
  const first = randomSymbol()
  let second = randomSymbol()
  while (second === first) {
    second = randomSymbol()
  }
  let third = randomSymbol()
  while (third === first || third === second) {
    third = randomSymbol()
  }
  return [first, second, third]
}

function ResultDialog({
  open,
  onOpenChange,
  result,
  minigame,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: MinigamePlayResult | null
  minigame: MinigameModel
}) {
  const t = useTranslations()

  if (!result) {
    return null
  }

  const isPrize = result.type === "prize"
  const imageUrl = isPrize
    ? result.prize.icon.url
    : minigame.prizeSettings.nonWinning.loseImage.url
  const label = isPrize
    ? result.prize.name
    : minigame.prizeSettings.nonWinning.title
  const title = isPrize
    ? minigame.winningMessageSettings.title
    : minigame.nonWinningMessageSettings.title
  const description = isPrize
    ? minigame.winningMessageSettings.description
    : minigame.nonWinningMessageSettings.description
  const closeLabel = isPrize
    ? minigame.winningMessageSettings.acceptButtonText ||
      t("minigames.play.close")
    : t("minigames.play.close")

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          {imageUrl && (
            // biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded prize image, not an optimizable static asset
            <img
              alt={label}
              className="size-24 object-contain"
              height={96}
              src={imageUrl}
              width={96}
            />
          )}
          {title && <DialogTitle className="text-xl">{title}</DialogTitle>}
          {description && <DialogDescription>{description}</DialogDescription>}
          <span className="font-extrabold text-2xl text-foreground">
            {label}
          </span>
        </DialogHeader>
        <DialogFooter className="justify-center sm:justify-center">
          <DialogClose render={<Button type="button">{closeLabel}</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RulesDialog({
  open,
  onOpenChange,
  name,
  rulesDescription,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  rulesDescription: string
}) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          {rulesDescription && (
            <DialogDescription className="whitespace-pre-wrap text-left">
              {rulesDescription}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost">
                {t("minigames.play.close")}
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function JackpotPlayScreen({
  minigame,
  contactState,
  token,
}: JackpotPlayScreenProps) {
  const t = useTranslations()
  const { appearance, generalSettings } = minigame

  const [remaining, setRemaining] = useState(contactState.remaining)
  const [isSpinning, setIsSpinning] = useState(false)
  const [reelSymbols, setReelSymbols] =
    useState<[string, string, string]>(WIN_SYMBOLS)
  const [spinningReels, setSpinningReels] = useState<
    [boolean, boolean, boolean]
  >([false, false, false])
  const [rulesOpen, setRulesOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [lastResult, setLastResult] = useState<MinigamePlayResult | null>(null)

  const spinIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([])
  const stopTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const spinStartRef = useRef(0)

  const clearSpinTimers = useCallback(() => {
    for (const id of spinIntervalsRef.current) {
      clearInterval(id)
    }
    for (const id of stopTimeoutsRef.current) {
      clearTimeout(id)
    }
    spinIntervalsRef.current = []
    stopTimeoutsRef.current = []
  }, [])

  useEffect(() => clearSpinTimers, [clearSpinTimers])

  const finishSpin = (result: MinigamePlayResult, newRemaining: number) => {
    const finalSymbols =
      result.type === "prize" ? WIN_SYMBOLS : pickMismatchedSymbols()
    const elapsed = Date.now() - spinStartRef.current

    REEL_STOP_DELAYS_MS.forEach((delay, index) => {
      const wait = Math.max(0, delay - elapsed)
      const timeoutId = setTimeout(() => {
        clearInterval(spinIntervalsRef.current[index])
        setReelSymbols((prev) => setAtIndex(prev, index, finalSymbols[index]))
        setSpinningReels((prev) => setAtIndex(prev, index, false))
        if (index === REEL_STOP_DELAYS_MS.length - 1) {
          setIsSpinning(false)
          setRemaining(newRemaining)
          setLastResult(result)
          setResultOpen(true)
        }
      }, wait)
      stopTimeoutsRef.current.push(timeoutId)
    })
  }

  const { execute, isPending } = useAction(playMinigameAction, {
    onSuccess: ({ data }) => {
      if (data) {
        finishSpin(data.result, data.remaining)
      }
    },
    onError: ({ error }) => {
      clearSpinTimers()
      setIsSpinning(false)
      setSpinningReels([false, false, false])
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  const handleStart = () => {
    if (isSpinning || isPending || remaining <= 0) {
      return
    }

    setIsSpinning(true)
    setSpinningReels([true, true, true])
    spinStartRef.current = Date.now()
    spinIntervalsRef.current = [0, 1, 2].map((index) =>
      setInterval(() => {
        setReelSymbols((prev) => setAtIndex(prev, index, randomSymbol()))
      }, SPIN_INTERVAL_MS),
    )

    execute({ minigameId: minigame.id, token })
  }

  const now = Date.now()
  const isBeforeStart = now < new Date(generalSettings.playedAtFrom).getTime()
  const isAfterEnd = now > new Date(generalSettings.playedAtTo).getTime()

  return (
    <div
      className="flex min-h-screen flex-col items-center gap-6 bg-center bg-cover px-4 py-8"
      style={{
        backgroundColor: appearance.backgroundColor,
        backgroundImage: appearance.backgroundImage.url
          ? `url(${appearance.backgroundImage.url})`
          : undefined,
      }}
    >
      <div className="relative w-full max-w-xs text-center">
        <h1
          className="font-semibold text-lg"
          style={{ color: appearance.ruleTextColor }}
        >
          {generalSettings.name}
        </h1>
        <button
          aria-label={t("minigames.preview.rules")}
          className="absolute top-1/2 right-0 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/70 shadow-sm"
          onClick={() => setRulesOpen(true)}
          style={{ color: appearance.ruleTextColor }}
          type="button"
        >
          <CircleHelpIcon className="size-4" />
        </button>
      </div>

      <div className="w-full max-w-xs">
        <JackpotMachineArt
          decorativeColor={appearance.decorativeColor}
          machineColor={appearance.machineColor}
          pulling={isSpinning}
          reelSymbols={reelSymbols}
          spinningReels={spinningReels}
        />
      </div>

      {isBeforeStart && (
        <p style={{ color: appearance.ruleTextColor }}>
          {t("minigames.play.notStartedYet")}
        </p>
      )}
      {!isBeforeStart && isAfterEnd && (
        <p style={{ color: appearance.ruleTextColor }}>
          {t("minigames.play.ended")}
        </p>
      )}
      {!(isBeforeStart || isAfterEnd) &&
        (remaining > 0 ? (
          <div className="flex flex-col items-center gap-2">
            <JackpotStartButton
              disabled={isSpinning || isPending}
              label={t("minigames.preview.start")}
              onClick={handleStart}
              startButtonImageUrl={appearance.startButtonImage.url}
            />
            <span
              className="text-sm"
              style={{ color: appearance.ruleTextColor }}
            >
              {t("minigames.play.drawsRemaining", { count: remaining })}
            </span>
          </div>
        ) : (
          <p style={{ color: appearance.ruleTextColor }}>
            {t("minigames.play.noDrawsLeft")}
          </p>
        ))}

      {appearance.prizeDescriptionImage.url && (
        // biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded image, not an optimizable static asset
        <img
          alt=""
          className="w-full max-w-xs object-contain"
          height={400}
          src={appearance.prizeDescriptionImage.url}
          width={750}
        />
      )}

      <RulesDialog
        name={generalSettings.name}
        onOpenChange={setRulesOpen}
        open={rulesOpen}
        rulesDescription={generalSettings.rulesDescription}
      />
      <ResultDialog
        minigame={minigame}
        onOpenChange={setResultOpen}
        open={resultOpen}
        result={lastResult}
      />
    </div>
  )
}
