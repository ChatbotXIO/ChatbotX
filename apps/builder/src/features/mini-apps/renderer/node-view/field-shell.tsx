import type { MiniAppOption } from "@chatbotx.io/mini-app"
import type { ReactNode } from "react"

export const inputClassName =
  "w-full rounded-md border border-[#d1d7db] bg-white px-3 py-2 text-[15px] text-[#111b21] outline-none focus:border-[#008069] disabled:cursor-default"

/** An input's label, then the control, then its error (or else its helper text). */
export function FieldShell({
  label,
  helper,
  error,
  children,
}: {
  label?: string
  helper?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span className="font-medium text-[#54656f] text-[13px]">{label}</span>
      ) : null}
      {children}
      {error ? (
        <span className="text-[#ea0038] text-[12px]">{error}</span>
      ) : null}
      {!error && helper ? (
        <span className="text-[#667781] text-[12px]">{helper}</span>
      ) : null}
    </div>
  )
}

export function OptionText({ option }: { option: MiniAppOption }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-[#111b21] text-[15px]">{option.title}</span>
      {option.description ? (
        <span className="text-[#667781] text-[13px]">{option.description}</span>
      ) : null}
      {option.metadata ? (
        <span className="text-[#667781] text-[12px]">{option.metadata}</span>
      ) : null}
    </span>
  )
}
