import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddAgentForm } from "./add-agent-form";
import { useTranslate } from "@tolgee/react";

export function AgentDialog() {
  const{t} = useTranslate();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{t("common.add")}</Button>
      </DialogTrigger>
      <DialogContent className="top-1/3 md:top-1/2 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-center">{t("common.addnew")}</DialogTitle>
          <DialogDescription>
            <AddAgentForm/>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
