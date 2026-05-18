"use client"

import { useTheme } from "next-themes"

export const useCurrentTheme = () => {
  const { theme, systemTheme } = useTheme()
  return theme === "system" ? systemTheme : theme
}
