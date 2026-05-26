"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import Image from "next/image"
import { useEffect, useState } from "react"
import { usePlatformSettings } from "@/features/platform"
import { useCurrentTheme } from "@/hooks/use-current-theme"

type BrandIconProps = {
  alt?: string
  className?: string
}

export const BrandIcon = ({
  alt = "Ícone da marca",
  className,
}: BrandIconProps) => {
  const currentTheme = useCurrentTheme()
  const [mounted, setMounted] = useState(false)
  const { logo } = usePlatformSettings()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={cn(className, "h-8 w-auto")} />
  }

  const baseLogoSrc =
    currentTheme === "dark" ? "/brand/logo_white.svg" : "/brand/logo_black.svg"
  const logoSrc = logo || baseLogoSrc

  // Icon collapsed — usa os novos PNGs do logo X1 do Pedro (2026-05-24).
  // PNGs originais: x1_white.png pro dark, x1_black.png pro light.
  // Caso o arquivo não exista, cai pros SVGs antigos.
  const baseIconSrc =
    currentTheme === "dark" ? "/brand/x1_white.png" : "/brand/x1_black.png"
  const iconSrc = logo || baseIconSrc

  return (
    <>
      {/* Logo - shown when expanded */}
      <Image
        alt={alt}
        className={cn(
          className,
          "h-8 w-auto group-data-[collapsible=icon]:hidden",
        )}
        height={5}
        src={logoSrc}
        width={10}
      />
      {/* Icon - shown when collapsed (default state do sidebar global do app).
          h-8/w-8 (32px display) com width/height=128 pra Next/Image gerar uma
          variant maior e nítida — antes ficava 32×32 borrado parecendo um X
          de close button. */}
      <Image
        alt={alt}
        className={cn(
          className,
          "hidden h-8 w-8 object-contain group-data-[collapsible=icon]:block",
        )}
        height={128}
        loading="eager"
        src={iconSrc}
        width={128}
      />
    </>
  )
}
