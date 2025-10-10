import type { StepType } from "@aha.chat/flow-config"
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
    <div className="flex gap-2">
      <menuItem.icon size={16} />
      {menuItem.label}
    </div>
  )
}

export default function RecursiveDropdownMenu({
  data,
  onClick,
}: {
  data: MenuItem[]
  onClick: (name: StepType) => void
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
            onClick={() => menuItem.stepType && onClick(menuItem.stepType)}
          >
            <MenuRow menuItem={menuItem} />
          </DropdownMenuItem>
        ),
      )}
    </>
  )
}
