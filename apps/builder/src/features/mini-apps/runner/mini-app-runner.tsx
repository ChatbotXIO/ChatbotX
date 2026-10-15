"use client"

import {
  findScreen,
  inputName,
  type MiniAppAction,
  type MiniAppAnswerErrorCode,
  type MiniAppDefinition,
  type MiniAppNode,
  type MiniAppRuntimeScope,
  nodeName,
  resolveCompletePayload,
  resolveRenderedNodes,
  screenLabel,
  validateAnswer,
} from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  Loader2Icon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useMemo, useState } from "react"
import { NodeView } from "../renderer/node-view"

type Answers = Record<string, Record<string, unknown>>

export type MiniAppRunnerProps = {
  definition: MiniAppDefinition
  /** Called with the `complete` payload; resolve to show the thank-you screen. */
  onComplete: (answers: Record<string, unknown>) => Promise<void>
  /**
   * Called with a screen's answers before the visitor moves to the next
   * screen, so they can be saved right away. A failure never blocks moving on.
   */
  onNavigate?: (
    screenKey: string,
    answers: Record<string, unknown>,
  ) => Promise<void>
  className?: string
}

const answerErrorKey = {
  required: "errors.required",
  invalidEmail: "errors.invalidEmail",
  invalidFormat: "errors.invalidFormat",
  tooShort: "errors.tooShort",
  selectMore: "errors.selectMore",
  selectFewer: "errors.selectFewer",
  uploadMore: "errors.uploadMore",
} as const satisfies Record<MiniAppAnswerErrorCode, string>

function DoneScreen() {
  const t = useTranslations("miniApps.runner")
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <CheckCircle2Icon className="size-12 text-[#008069]" />
      <span className="font-semibold text-[#111b21] text-lg">
        {t("doneTitle")}
      </span>
      <span className="text-[#667781] text-sm">{t("doneDescription")}</span>
    </div>
  )
}

export function MiniAppRunner({
  definition,
  onComplete,
  onNavigate,
  className,
}: MiniAppRunnerProps) {
  const t = useTranslations("miniApps.runner")
  const firstScreen = definition.screens[0]
  const [history, setHistory] = useState<string[]>(
    firstScreen ? [firstScreen.key] : [],
  )
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<Record<string, MiniAppAnswerErrorCode>>(
    {},
  )
  const [status, setStatus] = useState<
    "filling" | "saving" | "submitting" | "done"
  >("filling")

  const screen = findScreen(definition, history.at(-1) ?? "")
  const scope: MiniAppRuntimeScope = useMemo(
    () => ({ screenId: screen?.id ?? "", forms: answers }),
    [answers, screen?.id],
  )
  const rendered = useMemo(
    () => (screen ? resolveRenderedNodes(screen.children, scope) : []),
    [screen, scope],
  )

  const setValue = useCallback(
    (name: string, value: unknown) => {
      if (!screen) {
        return
      }
      setAnswers((current) => ({
        ...current,
        [screen.id]: { ...current[screen.id], [name]: value },
      }))
      setErrors((current) => {
        const { [name]: _removed, ...rest } = current
        return rest
      })
    },
    [screen],
  )

  const validateScreen = (): boolean => {
    const nextErrors: Record<string, MiniAppAnswerErrorCode> = {}
    for (const node of rendered) {
      const name = inputName(node)
      if (!name) {
        continue
      }
      const error = validateAnswer(node, answers[screen?.id ?? ""]?.[name])
      if (error) {
        nextErrors[name] = error
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const complete = async () => {
    if (!screen || status !== "filling") {
      return
    }
    const payload = resolveCompletePayload(definition, screen.key, scope)
    setStatus("submitting")
    try {
      await onComplete(payload)
      setStatus("done")
    } catch {
      setStatus("filling")
    }
  }

  const navigate = async (next: string) => {
    if (status !== "filling") {
      return
    }
    if (screen && onNavigate) {
      setStatus("saving")
      try {
        await onNavigate(screen.key, answers[screen.id] ?? {})
      } catch {
        // Saving early is best effort; the final submit still sends everything.
      }
      setStatus("filling")
    }
    setHistory((current) => [...current, next])
    setErrors({})
  }

  const handleAction = (action: MiniAppAction) => {
    if (action.name === "open_url") {
      window.open(action.url, "_blank", "noopener,noreferrer")
      return
    }
    // One step at a time: a screen save or submit in flight blocks the rest.
    if (status !== "filling" || !validateScreen()) {
      return
    }
    if (action.name === "navigate") {
      navigate(action.next).catch(() => undefined)
      return
    }
    complete().catch(() => undefined)
  }

  const errorText = (
    node: MiniAppNode,
    code: MiniAppAnswerErrorCode | undefined,
  ): string | undefined => {
    if (!code) {
      return
    }
    const custom = node.props["error-message"]
    return typeof custom === "string" && custom
      ? custom
      : t(answerErrorKey[code])
  }

  const body =
    status === "done" ? (
      <DoneScreen />
    ) : (
      <div className="flex flex-1 flex-col gap-4 p-4">
        {rendered.map((node) => {
          const name = nodeName(node) ?? ""
          return (
            <NodeView
              error={errorText(node, errors[name])}
              key={node.id}
              mode="run"
              node={node}
              onAction={handleAction}
              onChange={(value) => setValue(name, value)}
              scope={scope}
              value={answers[screen?.id ?? ""]?.[name]}
            />
          )
        })}
      </div>
    )

  return (
    <div
      className={cn(
        "flex min-h-full flex-col bg-white text-[#111b21]",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {history.length > 1 && status === "filling" ? (
          <button
            aria-label={t("back")}
            onClick={() => {
              setHistory((current) => current.slice(0, -1))
              setErrors({})
            }}
            type="button"
          >
            <ArrowLeftIcon className="size-5 text-[#54656f]" />
          </button>
        ) : (
          <XIcon className="size-5 text-[#54656f]" />
        )}
        <span className="flex-1 truncate font-medium text-[16px]">
          {status === "done" || !screen ? "" : screenLabel(screen)}
        </span>
        {status === "submitting" || status === "saving" ? (
          <Loader2Icon className="size-4 animate-spin text-[#008069]" />
        ) : null}
      </div>
      {body}
    </div>
  )
}
