import { DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { ActionType } from "../../action-type";
import { MenuItem } from "../types";

function MenuRow({ menuItem }: { menuItem: MenuItem }) {
  return (
    <>
      {menuItem.icon}
      {menuItem.label}
    </>
  )
}

export default function RecursiveDropdownMenu({ data, onClick }: { data: MenuItem[], onClick: (name: ActionType) => void }) {
  return (
    <>
      {
        data.map((menuItem: MenuItem, index: number) => {
          return menuItem.children && menuItem.children.length > 0 ?
            (
              <DropdownMenuSub key={index}>
                <DropdownMenuSubTrigger>
                  <MenuRow menuItem={menuItem} />
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <RecursiveDropdownMenu key={menuItem.actionType} data={menuItem.children} onClick={onClick} />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ) :
            (
              <DropdownMenuItem key={index} onClick={() => onClick(menuItem.actionType)}>
                <MenuRow menuItem={menuItem} />
              </DropdownMenuItem>
            )
        })
      }
    </>
  );
};


