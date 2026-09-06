"use client"

import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type {
  MinigameContactModel,
  MinigameModel,
} from "@chatbotx.io/database/types"
import {
  JackpotStartButton,
  SCRATCH_OFF_ANIMATION_DURATION_MS,
  ScratchOffArt,
  type ScratchOffPhase,
} from "@chatbotx.io/minigame-ui"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { playMinigameAction } from "../../actions/play-minigame.action"
import { MinigamePlayLayout } from "./minigame-play-layout"
import { ResultDialog } from "./result-dialog"

type ScratchOffPlayScreenProps = {
  minigame: MinigameModel
  contactState: MinigameContactModel
  token: string
  shareUrl: string | null
}

const REVEAL_DURATION_MS = 550

function getRevealContent(
  result: MinigamePlayResult,
  minigame: MinigameModel,
): { imageUrl: string; label: string } {
  if (result.type === "prize") {
    return { imageUrl: result.prize.icon.url, label: result.prize.name }
  }
  return {
    imageUrl: minigame.prizeSettings.nonWinning.loseImage.url,
    label: minigame.prizeSettings.nonWinning.title,
  }
}

export function ScratchOffPlayScreen({
  minigame,
  contactState,
  token,
  shareUrl,
}: ScratchOffPlayScreenProps) {
  const t = useTranslations()
  const { appearance, generalSettings } = minigame

  const [remaining, setRemaining] = useState(contactState.remaining)
  const [phase, setPhase] = useState<ScratchOffPhase>("idle")
  const [resultOpen, setResultOpen] = useState(false)
  const [lastResult, setLastResult] = useState<MinigamePlayResult | null>(null)

  const phaseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearPhaseTimeouts = useCallback(() => {
    for (const id of phaseTimeoutsRef.current) {
      clearTimeout(id)
    }
    phaseTimeoutsRef.current = []
  }, [])

  useEffect(() => clearPhaseTimeouts, [clearPhaseTimeouts])

  const { execute, isPending } = useAction(playMinigameAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        return
      }
      // The scratch reveal shows the real prize/lose art as it "scratches
      // in", so it can only start once the result is known — unlike
      // jackpot/gashapon there's no client-side animation running ahead of
      // the server response to hide network latency.
      setLastResult(data.result)
      setPhase("scratching")
      const scratchTimeout = setTimeout(() => {
        setPhase("revealed")
        const revealTimeout = setTimeout(() => {
          setPhase("idle")
          setRemaining(data.remaining)
          setResultOpen(true)
        }, REVEAL_DURATION_MS)
        phaseTimeoutsRef.current.push(revealTimeout)
      }, SCRATCH_OFF_ANIMATION_DURATION_MS)
      phaseTimeoutsRef.current.push(scratchTimeout)
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
    execute({ minigameId: minigame.id, token })
  }

  const revealContent = lastResult
    ? getRevealContent(lastResult, minigame)
    : null

  const now = Date.now()
  const isBeforeStart = now < new Date(generalSettings.playedAtFrom).getTime()
  const isAfterEnd = now > new Date(generalSettings.playedAtTo).getTime()

  return (
    <MinigamePlayLayout
      appearance={appearance}
      art={
        <ScratchOffArt
          cardTitle={t("minigames.preview.scratchOffCardTitle")}
          cardTitleColor={appearance.decorativeColor}
          decorativeColor={appearance.decorativeColor}
          machineColor={appearance.machineColor}
          phase={phase}
          revealImageUrl={revealContent?.imageUrl}
          revealLabel={revealContent?.label}
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
