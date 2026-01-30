import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import type { MenuItem } from "../nodes/types"

function MenuRow({ menuItem }: { menuItem: MenuItem }) {
  return (
    <div className="flex items-center gap-2">
      <menuItem.icon className="size-4" />
      {menuItem.label}
    </div>
  )
}

export default function RecursiveDropdownMenu({
  data,
  onClick,
}: {
  data: MenuItem[]
  onClick: (menuItem: MenuItem) => void
}) {
  return (
    <>
      {data.map((menuItem: MenuItem, index: number) =>
        menuItem.children && menuItem.children.length > 0 ? (
          <DropdownMenuSub key={menuItem.stepType ?? index}>
            <DropdownMenuSubTrigger>
              <MenuRow menuItem={menuItem} />
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <RecursiveDropdownMenu
                  data={menuItem.children}
                  key={menuItem.stepType ?? index}
                  onClick={onClick}
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem
            key={menuItem.stepType}
            onClick={() => menuItem.stepType && onClick(menuItem)}
          >
            <MenuRow menuItem={menuItem} />
          </DropdownMenuItem>
        ),
      )}
    </>
  )
}
