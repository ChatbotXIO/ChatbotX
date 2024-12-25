
"use client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch"
import { SketchPicker } from 'react-color'
import { ArrowDown, Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslate } from "@tolgee/react";
import { updateChatboxAction } from "./update-chatbox-action";
import { updateChatbotSchema } from "./update-chatbot-schema";
import { toast } from "sonner"
import { readChatboxAction } from "../read/read-chatbox-action";

const ctz = require('countries-and-timezones');

type Country = {
  id: string;
  name: string;
  timezones: string[];
};


const languages = [
  { name: "English", code: "en" },
  { name: 'Vietnamese', code: 'vi' },
]


export function UpdateChatbotForm({ id }: { id: string }) {
  const { t } = useTranslate()

  const [viewListLanguages] = useState(languages);

  const countries: { [key: string]: Country } = ctz.getAllCountries();
  const countryList = Object.values(countries);
  const [viewListCountries] = useState(countryList);

  const timeZones = Intl.supportedValuesOf('timeZone');
  const [viewListTimeZones] = useState(timeZones);

  const [openLanguages, setOpenLanguages] = useState(false)
  const [openCountry, setOpenCountry] = useState(false)
  const [openTimeZone, setOpenTimeZone] = useState(false)

  const [showPicker, setShowPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000")

  const togglePicker = () => {
    setShowPicker(!showPicker);
  };

  const handleOnChangeColor = (color: any) => {
    setCurrentColor(color.hex);
    setValue('brandColor', color.hex);
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateChatboxAction.bind(null, id),
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
          id: id,
          defaultReply: "",
          targetCountry: "",
          defaultLanguage: "",
          accountTimezone: "",
          brandColor: "",
          developmentMode: false,
        }
      },
      errorMapProps: {}
    });

  const { setValue } = form;

  useEffect(() => {
    const fetchChatbotData = async () => {
      const result = await readChatboxAction({ id });
      toast.success("Success to fetch chatbot data");
      if (result.successful && result.data) {
        setValue("defaultReply", result.data.defaultReply ?? "");
        setValue("targetCountry", result.data.targetCountry ?? "");
        setValue("defaultLanguage", result.data.defaultLanguage);
        setValue("accountTimezone", result.data.accountTimezone);
        setValue("brandColor", result.data.brandColor);
        setValue("developmentMode", result.data.developmentMode);
        setCurrentColor(result.data.brandColor)
      } else {
        toast.error(result.error ?? "Failed to fetch chatbot data");
      }
    };

    if (id) {
      fetchChatbotData();
    }
  }, [id, setValue]);


  return (
    <div className="">
      <Form {...form}>
        <form onSubmit={handleSubmitWithAction} className="flex flex-col gap-y-4 pt-4">
          <FormField control={form.control} name="defaultReply" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('chatbot.default-reply')}</FormLabel>
              <FormDescription>Select a default value for your contacts.</FormDescription>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                  <SelectTrigger>
                    <SelectValue placeholder="Generic Default Reply" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">None</SelectItem>
                      {/* <SelectItem value="default">Generic Default Reply</SelectItem>
                      <SelectItem value="list">
                        SYSTEM - List of frequently asked questions
                      </SelectItem> */}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>It is the default response that your chatbot will send to users when the
                chatbot doesn't know how to respond to the user message. Use a condition
                on your starting step if you want to send different messages based on the
                user channel.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />


          <FormField control={form.control}
            name="targetCountry" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('chatbot.target-country')}</FormLabel>
                <FormDescription>Select a country for your contacts.</FormDescription>
                <FormControl>
                  <Popover open={openCountry} onOpenChange={setOpenCountry}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCountry}
                      >
                        {field.value || "Select country..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <Command>
                        <CommandInput placeholder="Search country..." />
                        <CommandList>
                          <CommandEmpty>No country found.</CommandEmpty>
                          <CommandGroup>
                            {(viewListCountries || []).map((country, index) => (
                              <CommandItem
                                key={index}
                                value={country.id}
                                onSelect={() => {
                                  field.onChange(country.name);
                                  setOpenCountry(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${field.value === country.id ? "opacity-100" : "opacity-0"
                                    }`}
                                />
                                {country.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormDescription>
                  The country where most of your contacts live. The bot automatically adds the country code to a phone number shared by your contacts to make it a valid WhatsApp or SMS contact.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={form.control}
            name="defaultLanguage" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('chatbot.default-language')}</FormLabel>
                <FormDescription>Select a language for your contacts.</FormDescription>
                <FormControl>
                  <Popover open={openLanguages} onOpenChange={setOpenLanguages}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openLanguages}
                      >
                        {field.value || "Select Language..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className=" p-0">
                      <Command>
                        <CommandInput placeholder="Search language..." />
                        <CommandList>
                          <CommandEmpty>No language found.</CommandEmpty>
                          <CommandGroup>
                            {(viewListLanguages || []).map((language, index) => (
                              <CommandItem
                                key={index}
                                value={language.code}
                                onSelect={() => {
                                  field.onChange(language.code);
                                  setOpenLanguages(false)
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${field.value === language.code ? "opacity-100" : "opacity-0"}`}
                                />
                                {language.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormDescription>
                  Contacts are assigned the default language when the the contact language is unknown.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={form.control}
            name="accountTimezone" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('chatbot.timezone')}</FormLabel>
                <FormDescription>Select a time zone for your contacts.</FormDescription>
                <FormControl>
                  <Popover open={openLanguages} onOpenChange={setOpenLanguages}>
                    <Popover open={openTimeZone} onOpenChange={setOpenTimeZone}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openTimeZone}
                        >
                          {field.value || "Select Time Zone..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className=" p-0">
                        <Command>
                          <CommandInput placeholder="Search framework..." />
                          <CommandList>
                            <CommandEmpty>No Time Zone found.</CommandEmpty>
                            <CommandGroup>
                              {(viewListTimeZones || []).map((timezone, index) => (
                                <CommandItem
                                  key={index}
                                  value={timezone}
                                  onSelect={() => {
                                    field.onChange(timezone);
                                    setOpenTimeZone(false)
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${field.value === timezone ? "opacity-100" : "opacity-0"}`}
                                  />
                                  {timezone}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </Popover>
                </FormControl>
                <FormDescription>
                  Contacts are assigned this timezone when the the contact timezone is unknown.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={form.control}
            name="brandColor" render={() => (
              <FormItem>
                <FormLabel>{t('chatbot.brand-color')}</FormLabel>
                <FormDescription>Select a brand color for your contacts.</FormDescription>
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
                <FormDescription>
                  This color is used on buttons to match your branding on the landing page, emails and webchat.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={form.control}
            name="developmentMode" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('chatbot.development-mode')}</FormLabel>
                <FormDescription>Select a development mode for your contacts.</FormDescription>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>
                  Your bot will work only for bot admins. Enable this option if you are building your bot and don't want non admins to use the bot.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={form.control}
            name="developmentMode" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('chatbot.delete-account')}</FormLabel>
                <FormDescription>Delete chatbot account</FormDescription>
                <FormControl>
                  <Button variant="destructive">Delete</Button>

                </FormControl>
                <FormDescription>
                  All your data associated to this chatbot will be deleted in 24 hours.

                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

          <div className="mt-4 text-center">
            <Button type="submit">Submit</Button>
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
