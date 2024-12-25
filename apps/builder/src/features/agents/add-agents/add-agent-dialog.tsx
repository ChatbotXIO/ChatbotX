'use client'
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddAgentForm } from "./add-agent-form";
import { useTranslate } from "@tolgee/react";
import React from "react";

export function AddAgentDialog({ chatbotId }: { chatbotId: string }) {
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
        </DialogHeader>
        <div className="mt-2">
          <AddAgentForm
            onSubmmited={() => setOpen(false)}
            onCancelled={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
