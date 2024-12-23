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
import React from "react";

export function AddAgentDialog() {
  const { t } = useTranslate();
const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("common.add")}</Button>
      </DialogTrigger>
      <DialogContent className="top-1/3 md:top-1/2 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-center">
            {t("common.addnew")}
          </DialogTitle>
          <DialogDescription>
            <AddAgentForm onSubmmited={() => setOpen(false)} onCancelled={() => setOpen(false)}/>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
