'use client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslate } from "@tolgee/react";
import UpdateAgentForm from "./update-agent-form";

interface UpdateAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agent: { id: number; name: string };
}

export function UpdateAgentDialog({
  isOpen,
  onClose,
  agent,
}: UpdateAgentDialogProps) {
  const { t } = useTranslate();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <DialogDescription>
            <UpdateAgentForm/>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
