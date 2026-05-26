"use client"

import type { ComponentType, ReactElement } from "react"

/**
 * Helper compartilhado pra usar ícones da biblioteca pública `iconsax-reactjs`
 * (MIT) com a API "className" que o resto do app usa (estilo Lucide).
 *
 * Iconsax usa `size`/`color`/`variant` em vez de className. O wrapper aqui
 * renderiza um `<span>` com a className recebida + o ícone Iconsax dentro
 * com `size="100%"` e `color="currentColor"` (herda cor do parent).
 *
 * Padrão recomendado de uso em qualquer arquivo:
 *   import { wrapIconsax } from "@/components/iconsax-icon"
 *   import { Add, ArrowLeft2, Edit2 } from "iconsax-reactjs"
 *
 *   const AddIcon = wrapIconsax(Add)
 *   <AddIcon className="size-4 text-primary" />
 */
export type IconsaxComponent = ComponentType<{
  size?: string | number
  color?: string
  variant?: "Linear" | "Outline" | "Broken" | "Bold" | "Bulk" | "TwoTone"
}>

export type WrappedIcon = (props: { className?: string }) => ReactElement

/**
 * @param Component componente Iconsax (ex.: `Add`, `ArrowLeft2`, etc.)
 * @param variant variant default ("Outline" combina com o tema do app)
 */
export function wrapIconsax(
  Component: IconsaxComponent,
  variant:
    | "Linear"
    | "Outline"
    | "Broken"
    | "Bold"
    | "Bulk"
    | "TwoTone" = "Outline",
): WrappedIcon {
  const Wrapped: WrappedIcon = ({ className }) => (
    <span className={className}>
      <Component color="currentColor" size="100%" variant={variant} />
    </span>
  )
  // biome-ignore lint/suspicious/noExplicitAny: precisamos atribuir displayName
  ;(Wrapped as any).displayName =
    Component.displayName || Component.name || "IconsaxIcon"
  return Wrapped
}
