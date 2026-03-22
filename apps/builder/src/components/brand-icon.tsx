"use client"

import { cn } from "@aha.chat/ui/lib/utils"
import Image from "next/image"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

type BrandIconProps = {
  alt?: string
  className?: string
}

export const BrandIcon = ({
  alt = "Brand Icon",
  className,
}: BrandIconProps) => {
  const { theme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={cn(className, "h-8 w-auto")} />
  }

  const currentTheme = theme === "system" ? systemTheme : theme
  const logoSrc =
    currentTheme === "dark" ? "/brand/logo_white.svg" : "/brand/logo_black.svg"
  const iconSrc =
    currentTheme === "dark" ? "/brand/icon_white.svg" : "/brand/icon_black.svg"

  return (
    <>
      {/* Logo - shown when expanded */}
      <Image
        alt={alt}
        className={cn(
          className,
          "h-8 w-full group-data-[collapsible=icon]:hidden",
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
        src={iconSrc}
        width={10}
      />
    </>
  )
}
