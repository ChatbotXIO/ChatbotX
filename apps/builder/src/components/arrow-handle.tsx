import { cn } from "@chatbotx.io/ui/lib/utils"
import { Handle, type HandleProps, useNodeConnections } from "@xyflow/react"
import { ArrowRight2 } from "iconsax-reactjs"

/**
 * Handle estilo BotConversa: bolinha maior (20px) com setinha `>` dentro,
 * posicionada na borda externa do node (metade dentro, metade fora). Usada
 * pros source handles do fluxo principal — feedback visual claro de "saída"
 * pra próxima ação.
 *
 * Difere do `BaseHandle` (handles menores 11px sem ícone, usado em handles
 * internos como botões de quick reply).
 *
 * Cor do círculo personalizável via `handleColor` / `handleBorderColor`
 * (classes Tailwind tipo `!bg-emerald-500 !border-emerald-600`). Pedro pediu
 * cor distinta por tipo de node.
 */
export type ArrowHandleProps = HandleProps & {
  ref?: React.RefObject<HTMLDivElement>
  /** Classes Tailwind extras pra cor da bolinha (override do default). */
  colorClassName?: string
}

export const ArrowHandle = (
  props: ArrowHandleProps & { type?: "source" | "target" },
) => {
  const { ref, className, colorClassName, children, ...rest } = props

  const connections = useNodeConnections({
    handleType: rest.type,
    handleId: rest.id ?? "",
  })

  return (
    <Handle
      className={cn(
        // Tamanho 20px com setinha — estilo BotConversa
        "!flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 transition-colors",
        // Cor padrão UNIFORME pra todos os nodes (Pedro pediu minimalista —
        // sem variação de cor por tipo nas bolinhas). Azul claro sutil
        // estilo BotConversa.
        "!border-blue-500 !bg-blue-500",
        "hover:!bg-blue-400",
        connections.length > 0 && "!bg-blue-600 !border-blue-700",
        colorClassName,
        className,
      )}
      {...rest}
      ref={ref}
    >
      {/* Iconsax `ArrowRight2` — setinha estilo BotConversa */}
      <span className="flex size-3 items-center justify-center text-white">
        <ArrowRight2 color="currentColor" size="100%" variant="Bold" />
      </span>
      {children}
    </Handle>
  )
}

ArrowHandle.displayName = "ArrowHandle"
