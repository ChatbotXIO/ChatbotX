import { useMemo } from "react"
import { useUserPersistentMenuStore } from "./user-persistent-menu-store-context"

export const useUserPersistentMenuOptions = (): {
  value: string
  label: string
}[] => {
  const menus = useUserPersistentMenuStore((state) => state.menus)

  return useMemo(
    () =>
      menus.map((menu) => ({
        value: menu.id,
        label: menu.name,
      })),
    [menus],
  )
}
