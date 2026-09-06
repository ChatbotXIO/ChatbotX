"use client"

import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type {
  MinigameContactModel,
  MinigameModel,
} from "@chatbotx.io/database/types"
import {
  DrawLotsArt,
  type DrawLotsPhase,
  JackpotStartButton,
} from "@chatbotx.io/minigame-ui"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { playMinigameAction } from "../../actions/play-minigame.action"
import { MinigamePlayLayout } from "./minigame-play-layout"
import { ResultDialog } from "./result-dialog"

type DrawLotsPlayScreenProps = {
  minigame: MinigameModel
  contactState: MinigameContactModel
  token: string
  shareUrl: string | null
}

const SHUFFLE_DURATION_MS = 1200
const PULL_OUT_DURATION_MS = 900

export function DrawLotsPlayScreen({
  minigame,
  contactState,
  token,
  shareUrl,
}: DrawLotsPlayScreenProps) {
  const t = useTranslations()
  const { appearance, generalSettings } = minigame

  const [remaining, setRemaining] = useState(contactState.remaining)
  const [phase, setPhase] = useState<DrawLotsPhase>("idle")
  const [resultOpen, setResultOpen] = useState(false)
  const [lastResult, setLastResult] = useState<MinigamePlayResult | null>(null)

  const spinStartRef = useRef(0)
  const phaseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearPhaseTimeouts = useCallback(() => {
    for (const id of phaseTimeoutsRef.current) {
      clearTimeout(id)
    }
    phaseTimeoutsRef.current = []
  }, [])

  useEffect(() => clearPhaseTimeouts, [clearPhaseTimeouts])

  const revealResult = useCallback(
    (result: MinigamePlayResult, newRemaining: number) => {
      setPhase("drawn")
      const idleTimeout = setTimeout(() => {
        setPhase("idle")
        setRemaining(newRemaining)
        setLastResult(result)
        setResultOpen(true)
      }, PULL_OUT_DURATION_MS)
      phaseTimeoutsRef.current.push(idleTimeout)
    },
    [],
  )

  const { execute, isPending } = useAction(playMinigameAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        return
      }
      const elapsed = Date.now() - spinStartRef.current
      const wait = Math.max(0, SHUFFLE_DURATION_MS - elapsed)
      const shuffleTimeout = setTimeout(() => {
        revealResult(data.result, data.remaining)
      }, wait)
      phaseTimeoutsRef.current.push(shuffleTimeout)
    },
    onError: ({ error }) => {
      clearPhaseTimeouts()
      setPhase("idle")
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  const handleStart = () => {
    if (phase !== "idle" || isPending || remaining <= 0) {
      return
    }

    setPhase("shuffling")
    spinStartRef.current = Date.now()

    execute({ minigameId: minigame.id, token })
  }

  const now = Date.now()
  const isBeforeStart = now < new Date(generalSettings.playedAtFrom).getTime()
  const isAfterEnd = now > new Date(generalSettings.playedAtTo).getTime()

  return (
    <MinigamePlayLayout
      appearance={appearance}
      art={
        <DrawLotsArt
          decorativeColor={appearance.decorativeColor}
          machineColor={appearance.machineColor}
          phase={phase}
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
                  disabled={phase !== "idle" || isPending}
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
