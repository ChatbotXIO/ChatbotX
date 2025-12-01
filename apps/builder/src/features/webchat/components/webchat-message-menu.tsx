"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { MenuIcon } from "lucide-react"
import { useState } from "react"
import type { PersistentMenuSchema } from "../schemas/webchat.schema"

export default function WebchatMessageMenu() {
  // const { getMenus } = useGuestSessionStore((state) => state)
  const [menus, _setMenus] = useState<PersistentMenuSchema[]>([])

  // useEffect(() => {
  //   setMenus(getMenus())
  // }, [getMenus])

  console.log(menus)

  return menus.length > 0 ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="size-5" size="icon" variant="ghost">
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {menus.map((menu) => (
          <DropdownMenuItem key={menu.label}>{menu.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null
}
