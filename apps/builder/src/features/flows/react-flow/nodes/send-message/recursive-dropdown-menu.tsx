import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { MenuItem, SendMessageEditorItemType } from "./menu";

function MenuRow({ menuItem }: { menuItem: MenuItem }) {
  return (
    <>
      {menuItem.icon}
      {menuItem.label}
      {menuItem.proFeature && <Badge variant="destructive" className="font-normal text-xxs text-destructive-foreground">Pro</Badge>}
    </>
  )
}

export default function RecursiveDropdownMenu({ data, onClick }: { data: MenuItem[], onClick: (name: SendMessageEditorItemType) => void }) {
  return (
    <>
      {
        data.map((menuItem: MenuItem) => {
          return menuItem.children && menuItem.children.length > 0 ?
            (
              <DropdownMenuSub key={menuItem.type}>
                <DropdownMenuSubTrigger>
                  <MenuRow menuItem={menuItem} />
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <RecursiveDropdownMenu data={menuItem.children} onClick={onClick} />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ) :
            (
              <DropdownMenuItem key={menuItem.type} onClick={() => onClick(menuItem.type)}>
                <MenuRow menuItem={menuItem} />
              </DropdownMenuItem>
            )
        })
      }
    </>
  );
};


