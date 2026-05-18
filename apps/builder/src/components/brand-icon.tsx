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
  alt = "Brand Icon",
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

  const baseIconSrc =
    currentTheme === "dark" ? "/brand/icon_white.svg" : "/brand/icon_black.svg"
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
      {/* Icon - shown when collapsed */}
      <Image
        alt={alt}
        className={cn(
          className,
          "hidden h-8 w-(--sidebar-width-icon) group-data-[collapsible=icon]:block",
        )}
        height={5}
        loading="eager"
        src={iconSrc}
        width={10}
      />
    </>
  )
}
