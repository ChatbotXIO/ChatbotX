"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Field, FieldType } from "@ahachat.ai/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { useTranslate } from '@tolgee/react';
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEventHandler, useEffect, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DayPicker } from "react-day-picker";
import { setHours, setMinutes } from "date-fns";
import { updateFieldValueAction } from "./actions/update-field-value-action";
import { updateFieldValueSchema } from "./schemas/update-field-value-schema";

export function UpdateAccountFieldDialog({
  chatbotId,
  accountField,
  open,
  onOpenChange
}: {
  open: boolean,
  onOpenChange: (val: boolean) => void,
  chatbotId: string,
  accountField: Field | null,
}) {
  const { t } = useTranslate();
  const router = useRouter()
  const fieldType = FieldType.AccountField
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedDateTime, setSelectedDateTime] = useState<Date>();
  const [timeValue, setTimeValue] = useState<string>("00:00");

  const {
    form,
    handleSubmitWithAction
  } = useHookFormAction(updateFieldValueAction.bind(null, chatbotId, accountField?.id ?? "", fieldType), zodResolver(updateFieldValueSchema), {
    actionProps: {
      onSuccess: () => {
        toast.success(`Account Field update successfully`)

        onOpenChange(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      }
    },
    formProps: {
      mode: "onChange",
      defaultValues: {
        value: accountField?.value || undefined,
      }
    },
    errorMapProps: {}
  });

  useEffect(() => {
    if (accountField?.value) {
      const parsedDate = new Date(accountField.value);
      if (!isNaN(parsedDate.getTime())) {
        setSelectedDate(parsedDate);
        setSelectedDateTime(parsedDate);
        setTimeValue(parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        form.setValue("value", parsedDate.toLocaleString());
      }
    }
  }, [accountField?.value, form]);


  useEffect(() => {
    if (accountField?.value) {
      form.setValue("value", accountField.value);
    }
  }, [accountField, form]);

  const handleTimeChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const time = e.target.value;
    if (!selectedDateTime) {
      setTimeValue(time);
      return;
    }
    const [hours, minutes] = time.split(":").map((str) => parseInt(str, 10));
    const newSelectedDate = setHours(setMinutes(selectedDateTime, minutes as any), hours as any);
    setSelectedDateTime(newSelectedDate);
    setTimeValue(time);
    form.setValue("value", selectedDateTime ? selectedDateTime.toLocaleString() : "")
  };

  const handleDaySelect = (date: Date | undefined) => {
    if (!timeValue || !date) {
      setSelectedDateTime(date);
      return;
    }
    const [hours, minutes] = timeValue
      .split(":")
      .map((str) => parseInt(str, 10));
    const newDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hours,
      minutes
    );
    setSelectedDateTime(newDate);
  };

  const renderValueInput = () => {
    switch (accountField?.customFieldType) {
      case "ShortText":
        return (
          <FormControl>
            <Input placeholder="Enter text" {...form.register("value")} />
          </FormControl>
        );
      case "Number":
        return (
          <FormControl>
            <Input type="number" placeholder="Enter number" {...form.register("value")} />
          </FormControl>
        );
      case "Boolean":
        return (
          <FormControl>
            <Select value={form.watch("value") || ""} onValueChange={(value) => form.setValue("value", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select true/false" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          </FormControl>
        );
      case "Date":
        return (
          <FormControl>
            <DayPicker
              mode="single"
              selected={selectedDate || form.watch("value") as any}
              onSelect={(date) => {
                setSelectedDate(date);
                form.setValue("value", date ? date.toLocaleDateString() : "");
              }}
              footer={
                selectedDate ? `Selected: ${selectedDate.toLocaleDateString()}` : "Pick a day."
              }
            />
          </FormControl>
        );
      case "DateTime":
        return (
          <div>
            <label>
              Set the time:{" "}
              <input type="time" value={timeValue} onChange={handleTimeChange} />
            </label>
            <DayPicker
              mode="single"
              selected={selectedDate || form.watch("value") as any}
              onSelect={handleDaySelect}
              footer={`Selected date: ${selectedDateTime ? selectedDateTime.toLocaleString() : "none"}`}
            />
          </div>
        );
      case "LongText":
        return (
          <FormControl>
            <Input placeholder="Enter text" {...form.register("value")} />
          </FormControl>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('field.update.title')}: {accountField?.name}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">

              <FormField
                control={form.control}
                name="value"
                render={() => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    {renderValueInput()}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel-btn')}</Button>
                <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
                  {t('common.confirm-btn')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
