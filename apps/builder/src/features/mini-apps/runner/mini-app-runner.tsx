"use client"

import {
  buildCompletePayload,
  evaluateExpression,
  isTruthy,
  MINI_APP_COMPONENTS,
  type MiniAppAction,
  type MiniAppDefinition,
  type MiniAppNode,
  type MiniAppRuntimeScope,
  type MiniAppScreen,
  parseReference,
  resolveReference,
} from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  Loader2Icon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useCallback, useMemo, useState } from "react"
import { NodeView } from "../components/node-view"

type Answers = Record<string, Record<string, unknown>>

export type MiniAppRunnerProps = {
  definition: MiniAppDefinition
  /** Called with the `complete` payload; resolve to show the thank-you screen. */
  onComplete: (answers: Record<string, unknown>) => Promise<void>
  className?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isVisible = (node: MiniAppNode, scope: MiniAppRuntimeScope): boolean => {
  const visible = node.props.visible
  if (visible === undefined) {
    return true
  }
  return isTruthy(evaluateExpression(visible as string | boolean, scope))
}

/** The children that actually render, after If / Switch / visibility. */
const resolveRendered = (
  nodes: readonly MiniAppNode[],
  scope: MiniAppRuntimeScope,
): MiniAppNode[] => {
  const result: MiniAppNode[] = []
  for (const node of nodes) {
    if (!isVisible(node, scope)) {
      continue
    }
    if (node.type === "If") {
      const condition = node.props.condition as string | boolean
      const branch = isTruthy(evaluateExpression(condition, scope))
        ? "then"
        : "else"
      result.push(...resolveRendered(node.slots?.[branch] ?? [], scope))
    } else if (node.type === "Switch") {
      const value = evaluateExpression(String(node.props.value ?? ""), scope)
      result.push(
        ...resolveRendered(node.slots?.[String(value ?? "")] ?? [], scope),
      )
    } else if (node.type === "Form") {
      result.push(...resolveRendered(node.slots?.children ?? [], scope))
    } else {
      result.push(node)
    }
  }
  return result
}

const isEmptyAnswer = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  value === false ||
  (Array.isArray(value) && value.length === 0)

type FieldErrorCode =
  | "required"
  | "invalidEmail"
  | "invalidFormat"
  | "tooShort"
  | "selectMore"
  | "selectFewer"
  | "uploadMore"

const fieldErrorKey = {
  required: "errors.required",
  invalidEmail: "errors.invalidEmail",
  invalidFormat: "errors.invalidFormat",
  tooShort: "errors.tooShort",
  selectMore: "errors.selectMore",
  selectFewer: "errors.selectFewer",
  uploadMore: "errors.uploadMore",
} as const satisfies Record<FieldErrorCode, string>

const validateField = (
  node: MiniAppNode,
  value: unknown,
): FieldErrorCode | undefined => {
  const props = node.props
  if (node.type === "PhotoPicker" || node.type === "DocumentPicker") {
    const count = Array.isArray(value) ? value.length : 0
    const min =
      props[
        node.type === "PhotoPicker"
          ? "min-uploaded-photos"
          : "min-uploaded-documents"
      ]
    return typeof min === "number" && count < min ? "uploadMore" : undefined
  }
  if (isEmptyAnswer(value)) {
    return props.required === true ? "required" : undefined
  }
  if (node.type === "TextInput" && typeof value === "string") {
    if (props["input-type"] === "email" && !EMAIL_PATTERN.test(value)) {
      return "invalidEmail"
    }
    if (typeof props.pattern === "string" && props.pattern) {
      try {
        if (!new RegExp(props.pattern).test(value)) {
          return "invalidFormat"
        }
      } catch {
        // An invalid pattern is reported by the editor, not the visitor.
      }
    }
    if (
      typeof props["min-chars"] === "number" &&
      value.length < props["min-chars"]
    ) {
      return "tooShort"
    }
  }
  if (Array.isArray(value)) {
    if (
      typeof props["min-selected-items"] === "number" &&
      value.length < props["min-selected-items"]
    ) {
      return "selectMore"
    }
    if (
      typeof props["max-selected-items"] === "number" &&
      value.length > props["max-selected-items"]
    ) {
      return "selectFewer"
    }
  }
  return
}

export function MiniAppRunner({
  definition,
  onComplete,
  className,
}: MiniAppRunnerProps) {
  const t = useTranslations("miniApps.runner")
  const firstScreen = definition.screens[0]
  const [history, setHistory] = useState<string[]>(
    firstScreen ? [firstScreen.key] : [],
  )
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<Record<string, FieldErrorCode>>({})
  const [status, setStatus] = useState<"filling" | "submitting" | "done">(
    "filling",
  )

  const screen = definition.screens.find(
    (candidate) => candidate.key === history.at(-1),
  ) as MiniAppScreen | undefined
  const scope: MiniAppRuntimeScope = useMemo(
    () => ({ screenId: screen?.id ?? "", forms: answers }),
    [answers, screen?.id],
  )
  const rendered = useMemo(
    () => (screen ? resolveRendered(screen.children, scope) : []),
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
    const nextErrors: Record<string, FieldErrorCode> = {}
    for (const node of rendered) {
      const name = node.props.name
      if (
        !(MINI_APP_COMPONENTS[node.type].isInput && typeof name === "string")
      ) {
        continue
      }
      const error = validateField(node, answers[screen?.id ?? ""]?.[name])
      if (error) {
        nextErrors[name] = error
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const complete = async () => {
    if (!screen) {
      return
    }
    const payload: Record<string, unknown> = {}
    for (const [key, binding] of Object.entries(
      buildCompletePayload(definition, screen.key),
    )) {
      const reference = parseReference(binding.slice(2, -1))
      const value = reference ? resolveReference(reference, scope) : undefined
      if (value !== undefined) {
        payload[key] = value
      }
    }
    setStatus("submitting")
    try {
      await onComplete(payload)
      setStatus("done")
    } catch {
      setStatus("filling")
    }
  }

  const handleAction = (action: MiniAppAction) => {
    if (action.name === "open_url") {
      window.open(action.url, "_blank", "noopener,noreferrer")
      return
    }
    if (!validateScreen()) {
      return
    }
    if (action.name === "navigate") {
      setHistory((current) => [...current, action.next])
      setErrors({})
      return
    }
    complete().catch(() => undefined)
  }

  const errorText = (
    node: MiniAppNode,
    code: FieldErrorCode | undefined,
  ): string | undefined => {
    if (!code) {
      return
    }
    const custom = node.props["error-message"]
    return typeof custom === "string" && custom
      ? custom
      : t(fieldErrorKey[code])
  }

  let body: ReactNode
  if (status === "done") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <CheckCircle2Icon className="size-12 text-[#008069]" />
        <span className="font-semibold text-[#111b21] text-lg">
          {t("doneTitle")}
        </span>
        <span className="text-[#667781] text-sm">{t("doneDescription")}</span>
      </div>
    )
  } else {
    body = (
      <div className="flex flex-1 flex-col gap-4 p-4">
        {rendered.map((node) => {
          const name =
            typeof node.props.name === "string" ? node.props.name : ""
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
  }

  return (
    <div
      className={cn(
        "flex min-h-full flex-col bg-white text-[#111b21]",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {history.length > 1 && status !== "done" ? (
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
          {status === "done" ? "" : screen?.title || screen?.id}
        </span>
        {status === "submitting" ? (
          <Loader2Icon className="size-4 animate-spin text-[#008069]" />
        ) : null}
      </div>
      {body}
    </div>
  )
}
