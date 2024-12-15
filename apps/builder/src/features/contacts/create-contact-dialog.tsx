"use client"

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTranslate } from '@tolgee/react';
import { CreateContactForm } from "./create-contact-form";
import React from "react";

export function CreateContactDialog({ chatbotId }: { chatbotId: string }) {
  const { t } = useTranslate();

  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('contacts.create.btn')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('contacts.create.title')}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <CreateContactForm chatbotId={chatbotId} onSubmmited={() => setOpen(false)} onCancelled={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
