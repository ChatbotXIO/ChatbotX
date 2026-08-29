"use client"

import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type {
  MinigameContactModel,
  MinigameModel,
} from "@chatbotx.io/database/types"
import {
  computeLuckyWheelTargetRotationDeg,
  JackpotStartButton,
  LuckyWheelArt,
  randomLuckyWheelJitterDeg,
} from "@chatbotx.io/minigame-ui"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { playMinigameAction } from "../../actions/play-minigame.action"
import {
  buildLuckyWheelSegments,
  getLuckyWheelTargetSegmentIndex,
} from "../../lib/lucky-wheel-segments"
import { MinigamePlayLayout } from "./minigame-play-layout"
import { ResultDialog } from "./result-dialog"

type LuckyWheelPlayScreenProps = {
  minigame: MinigameModel
  contactState: MinigameContactModel
  token: string
}

const FAST_SPIN_TURNS = 2
const WIND_UP_DURATION_MS = 1000
const REVEAL_EXTRA_SPINS = 3
const REVEAL_DURATION_MS = 3200
const REVEAL_EASING = "cubic-bezier(0.12, 0.65, 0.18, 1)"
const WIND_UP_EASING = "linear"
const SEGMENT_LANDING_PADDING_DEG = 6
const FULL_TURN_DEG = 360

export function LuckyWheelPlayScreen({
  minigame,
  contactState,
  token,
}: LuckyWheelPlayScreenProps) {
  const t = useTranslations()
  const { appearance, generalSettings, prizeSettings } = minigame
  const segments = useMemo(
    () => buildLuckyWheelSegments(prizeSettings),
    [prizeSettings],
  )

  const [remaining, setRemaining] = useState(contactState.remaining)
  const [isSpinning, setIsSpinning] = useState(false)
  const [rotationDeg, setRotationDeg] = useState(0)
  const [transitionMs, setTransitionMs] = useState(0)
  const [transitionEasing, setTransitionEasing] = useState(WIND_UP_EASING)
  const [resultOpen, setResultOpen] = useState(false)
  const [lastResult, setLastResult] = useState<MinigamePlayResult | null>(null)

  const spinStartRef = useRef(0)
  const pendingRevealRef = useRef<{
    result: MinigamePlayResult
    newRemaining: number
  } | null>(null)
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current)
      }
    },
    [],
  )

  const beginReveal = useCallback(
    (result: MinigamePlayResult, newRemaining: number) => {
      const targetIndex = getLuckyWheelTargetSegmentIndex(segments, result)
      const jitterDeg = randomLuckyWheelJitterDeg(
        segments.length,
        SEGMENT_LANDING_PADDING_DEG,
      )

      pendingRevealRef.current = { result, newRemaining }
      setTransitionEasing(REVEAL_EASING)
      setTransitionMs(REVEAL_DURATION_MS)
      setRotationDeg((prev) =>
        computeLuckyWheelTargetRotationDeg(
          prev,
          segments.length,
          targetIndex,
          REVEAL_EXTRA_SPINS,
          jitterDeg,
        ),
      )
    },
    [segments],
  )

  const { execute, isPending } = useAction(playMinigameAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        return
      }
      const elapsed = Date.now() - spinStartRef.current
      const wait = Math.max(0, WIND_UP_DURATION_MS - elapsed)
      revealTimeoutRef.current = setTimeout(() => {
        beginReveal(data.result, data.remaining)
      }, wait)
    },
    onError: ({ error }) => {
      setIsSpinning(false)
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  const handleTransitionEnd = useCallback(() => {
    const pending = pendingRevealRef.current
    if (!pending) {
      return
    }
    pendingRevealRef.current = null
    setIsSpinning(false)
    setRemaining(pending.newRemaining)
    setLastResult(pending.result)
    setResultOpen(true)
  }, [])

  const handleStart = () => {
    if (isSpinning || isPending || remaining <= 0) {
      return
    }

    setIsSpinning(true)
    spinStartRef.current = Date.now()
    setTransitionEasing(WIND_UP_EASING)
    setTransitionMs(WIND_UP_DURATION_MS)
    setRotationDeg((prev) => prev + FAST_SPIN_TURNS * FULL_TURN_DEG)

    execute({ minigameId: minigame.id, token })
  }

  const now = Date.now()
  const isBeforeStart = now < new Date(generalSettings.playedAtFrom).getTime()
  const isAfterEnd = now > new Date(generalSettings.playedAtTo).getTime()

  return (
    <MinigamePlayLayout
      appearance={appearance}
      art={
        <LuckyWheelArt
          decorativeColor={appearance.decorativeColor}
          machineColor={appearance.machineColor}
          onTransitionEnd={handleTransitionEnd}
          rotationDeg={rotationDeg}
          segments={segments}
          transitionDurationMs={transitionMs}
          transitionEasing={transitionEasing}
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
