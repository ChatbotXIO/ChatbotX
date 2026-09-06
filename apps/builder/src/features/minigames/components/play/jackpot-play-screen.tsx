"use client"

import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type {
  MinigameContactModel,
  MinigameModel,
} from "@chatbotx.io/database/types"
import {
  JACKPOT_REEL_SYMBOLS,
  JACKPOT_WIN_SYMBOL,
  JackpotMachineArt,
  JackpotStartButton,
} from "@chatbotx.io/minigame-ui"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { playMinigameAction } from "../../actions/play-minigame.action"
import { MinigamePlayLayout } from "./minigame-play-layout"
import { ResultDialog } from "./result-dialog"

type JackpotPlayScreenProps = {
  minigame: MinigameModel
  contactState: MinigameContactModel
  token: string
  shareUrl: string | null
}

const SPIN_INTERVAL_MS = 100
const REEL_STOP_DELAYS_MS: [number, number, number] = [1200, 3200, 5200]
const WIN_SYMBOLS: [string, string, string] = [
  JACKPOT_WIN_SYMBOL,
  JACKPOT_WIN_SYMBOL,
  JACKPOT_WIN_SYMBOL,
]

function randomSymbol(): string {
  return JACKPOT_REEL_SYMBOLS[
    Math.floor(Math.random() * JACKPOT_REEL_SYMBOLS.length)
  ]
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

export function JackpotPlayScreen({
  minigame,
  contactState,
  token,
  shareUrl,
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
    <MinigamePlayLayout
      appearance={appearance}
      art={
        <JackpotMachineArt
          decorativeColor={appearance.decorativeColor}
          machineColor={appearance.machineColor}
          pulling={isSpinning}
          reelSymbols={reelSymbols}
          spinningReels={spinningReels}
        />
      }
      dialog={
        <ResultDialog
          minigame={minigame}
          onOpenChange={setResultOpen}
          open={resultOpen}
          result={lastResult}
        />
      }
      name={generalSettings.name}
      prizeDescriptionImageUrl={appearance.prizeDescriptionImage.url}
      rulesDescription={generalSettings.rulesDescription}
      shareUrl={shareUrl}
      showName={generalSettings.showName ?? true}
      status={
        <>
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
        </>
      }
    />
  )
}
