import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useTranslate } from "@tolgee/react";
import { PlusIcon } from "lucide-react";
import { SendMessageEditorItemType, sendMessageEditorMenu } from "./menu";
import RecursiveDropdownMenu from "./recursive-dropdown-menu";

export default function SendMessageEditorAction({ onClick }: { onClick: (name: SendMessageEditorItemType) => void }) {
  const { t } = useTranslate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <PlusIcon />
          {t("flows.sendMessageNodeEditor.addContent")}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56">
        <RecursiveDropdownMenu data={sendMessageEditorMenu} onClick={onClick} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
