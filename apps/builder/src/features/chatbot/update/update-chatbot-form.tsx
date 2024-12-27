"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react";
import { Switch } from "@/components/ui/switch"
import { SketchPicker } from 'react-color'
import { ArrowDown } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslate } from "@tolgee/react";
import { updateChatbotAction } from "./update-chatbox-action";
import { updateChatbotSchema } from "./update-chatbot-schema";
import { toast } from "sonner"
import { getAllCountries } from "countries-and-timezones";
import { ComboboxComponent } from '../components/ComboboxComponent';


type Country = {
  id: string;
  name: string;
  timezones: string[];
};

type ChatbotData = {
  defaultReply: string | null | undefined;
  targetCountry: string | null | undefined;
  defaultLanguage: string;
  accountTimezone: string;
  brandColor: string;
  developmentMode: boolean;
}

const viewListLanguages = [
  { name: "English", code: "en" },
  { name: 'Vietnamese', code: 'vi' },
]

export function UpdateChatbotForm({ id, chatbot }: { id: string, chatbot: ChatbotData }) {
  const { t } = useTranslate()

  const countries: { [key: string]: Country } = getAllCountries();
  const viewListCountries = Object.values(countries);
  const viewListTimeZones = Intl.supportedValuesOf('timeZone');

  const [openLanguages, setOpenLanguages] = useState(false)
  const [openCountry, setOpenCountry] = useState(false)
  const [openTimeZone, setOpenTimeZone] = useState(false)

  const [showPicker, setShowPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState(chatbot.brandColor || "#000000")

  const togglePicker = () => {
    setShowPicker(!showPicker);
  };

  const handleOnChangeColor = (color: any) => {
    setCurrentColor(color.hex);
    setValue('brandColor', color.hex);
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateChatbotAction.bind(null, id),
    zodResolver(updateChatbotSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Update chatbot successfully")
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
          defaultReply: chatbot.defaultReply ?? null,
          targetCountry: chatbot.targetCountry ?? null,
          defaultLanguage: chatbot.defaultLanguage,
          accountTimezone: chatbot.accountTimezone,
          brandColor: chatbot.brandColor,
          developmentMode: chatbot.developmentMode,
        }
      },
      errorMapProps: {}
    });

  const { setValue } = form;

  return (
    <div className="">
      <Form {...form}>
        <form onSubmit={handleSubmitWithAction} className="flex flex-col gap-y-4 pt-4">
          <FormField control={form.control} name="defaultReply" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('chatbot.default-reply')}</FormLabel>
              <FormDescription>{t('chatbot.default-reply-description')}</FormDescription>
              <FormControl>
                <Select
                  value={field.value || "null"}
                  onValueChange={(value) => {
                    field.onChange(value === "null" ? null : value);
                  }}
                  name={field.name}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Generic Default Reply" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="null">None</SelectItem>
                      <SelectItem value="default">Generic Default Reply</SelectItem>
                      {/* <SelectItem value="list">
                        SYSTEM - List of frequently asked questions
                      </SelectItem> */}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField
            control={form.control}
            name="targetCountry"
            render={({ field }) => (
              <ComboboxComponent
                label={t('chatbot.target-country')}
                description={t('chatbot.target-country-description')}
                placeholder={t('chatbot.target-country-placeholder')}
                options={viewListCountries}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                openPopover={openCountry}
                setoOpenPopover={setOpenCountry}
              />
            )}
          />

          <FormField
            control={form.control}
            name="defaultLanguage"
            render={({ field }) => (
              <ComboboxComponent
                label={t('chatbot.default-language')}
                description={t('chatbot.default-language-description')}
                placeholder={t('chatbot.default-language-placeholder')}
                options={viewListLanguages}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.code}
                openPopover={openLanguages}
                setoOpenPopover={setOpenLanguages}
              />
            )}
          />

          <FormField
            control={form.control}
            name="accountTimezone"
            render={({ field }) => (
              <ComboboxComponent
                label={t('chatbot.timezone')}
                description={t('chatbot.timezone-description')}
                placeholder={t('chatbot.timezone-placeholder')}
                options={viewListTimeZones}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                getOptionLabel={(option) => option}
                getOptionValue={(option) => option}
                openPopover={openTimeZone}
                setoOpenPopover={setOpenTimeZone}
              />
            )}
          />

          <FormField control={form.control}
            name="brandColor" render={() => (
              <FormItem>
                <FormLabel>{t('chatbot.brand-color')}</FormLabel>
                <FormDescription>{t('chatbot.brand-color-description')}</FormDescription>
                <FormControl>
                  <Dialog open={showPicker} onOpenChange={togglePicker}>
                    <DialogTrigger asChild>
                      <Button
                        onClick={togglePicker}
                        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        style={{ backgroundColor: currentColor }}
                      >
                        <ArrowDown />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Brand Color</DialogTitle>
                      </DialogHeader>
                      <SketchPicker color={currentColor} onChangeComplete={handleOnChangeColor} />
                      <DialogFooter>
                        <Button variant="destructive" onClick={togglePicker}>
                          Close
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={form.control}
            name="developmentMode" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('chatbot.development-mode')}</FormLabel>
                <FormDescription>{t('chatbot.development-mode-description')}</FormDescription>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={form.control}
            name="developmentMode" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('chatbot.delete-account')}</FormLabel>
                <FormDescription>{t('chatbot.delete-account-description')}</FormDescription>
                <FormControl>
                  <Button variant="destructive">{t('chatbot.button-delete')}</Button>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

          <div className="mt-4 text-center">
            <Button type="submit">{t('chatbot.button-submit')}</Button>
          </div>
        </form>
      </Form>

      <div className="flex content-center justify-center py-4 gap-x-10">
        <Button type="button"><u>Rename Account</u></Button>
        <Button type="button"><u>Change Account Logo</u></Button>
      </div>

      <div className="mt-4 text-center">
        <p className="text-gray-500">User  ID: 1001966523</p>
        <p className="text-gray-500">Account ID: 1712583</p>
        <p className="text-gray-500">Key: n8S4ll3s8ocJ0ykHN77L</p>
      </div>
    </div>
  )
}
