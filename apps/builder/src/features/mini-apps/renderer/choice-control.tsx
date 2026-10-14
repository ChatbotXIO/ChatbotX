import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import type { ComponentProps } from "react"

/**
 * WhatsApp-style radio / checkbox. The native control's unchecked look is set
 * by the browser (and turns grey when disabled), so it is drawn here: white
 * with a light border, green once checked.
 */
export function ChoiceControl({
  type,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { type: "radio" | "checkbox" }) {
  const isRadio = type === "radio"
  return (
    <span className={cn("relative inline-flex size-5 shrink-0", className)}>
      <input
        className={cn(
          "peer size-5 cursor-pointer appearance-none border-2 border-[#c4ccd1] bg-white transition-colors disabled:cursor-default",
          isRadio
            ? "rounded-full checked:border-[#008069] checked:border-[6px]"
            : "rounded checked:border-[#008069] checked:bg-[#008069]",
        )}
        type={type}
        {...props}
      />
      {isRadio ? null : (
        <CheckIcon
          className="pointer-events-none absolute inset-0.5 hidden size-4 text-white peer-checked:block"
          strokeWidth={3}
        />
      )}
    </span>
  )
}
