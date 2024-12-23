
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
import { ArrowDown, Check, ChevronsUpDown, Facebook } from 'lucide-react';
import timezones from 'timezones.json';
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import _, { debounce } from 'lodash';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, Controller } from "react-hook-form";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslate } from "@tolgee/react";
import { updateChatboxAction } from "./update-chatbox-action";
import { updateChatbotSchema } from "./update-chatbot-schema";
import { toast } from "sonner"

const countries = [
  { name: 'Afghanistan', code: 'AF' },
  { name: 'Åland Islands', code: 'AX' },
  { name: 'Albania', code: 'AL' },
  { name: 'Algeria', code: 'DZ' },
  { name: 'American Samoa', code: 'AS' },
  { name: 'AndorrA', code: 'AD' },
  { name: 'Angola', code: 'AO' },
  { name: 'Anguilla', code: 'AI' },
  { name: 'Antarctica', code: 'AQ' },
  { name: 'Antigua and Barbuda', code: 'AG' },
  { name: 'Argentina', code: 'AR' },
  { name: 'Armenia', code: 'AM' },
  { name: 'Aruba', code: 'AW' },
  { name: 'Australia', code: 'AU' },
  { name: 'Austria', code: 'AT' },
  { name: 'Azerbaijan', code: 'AZ' },
  { name: 'Bahamas', code: 'BS' },
  { name: 'Bahrain', code: 'BH' },
  { name: 'Bangladesh', code: 'BD' },
  { name: 'Barbados', code: 'BB' },
  { name: 'Belarus', code: 'BY' },
  { name: 'Belgium', code: 'BE' },
  { name: 'Belize', code: 'BZ' },
  { name: 'Benin', code: 'BJ' },
  { name: 'Bermuda', code: 'BM' },
  { name: 'Bhutan', code: 'BT' },
  { name: 'Bolivia', code: 'BO' },
  { name: 'Bosnia and Herzegovina', code: 'BA' },
  { name: 'Botswana', code: 'BW' },
  { name: 'Bouvet Island', code: 'BV' },
  { name: 'Brazil', code: 'BR' },
  { name: 'British Indian Ocean Territory', code: 'IO' },
  { name: 'Brunei Darussalam', code: 'BN' },
  { name: 'Bulgaria', code: 'BG' },
  { name: 'Burkina Faso', code: 'BF' },
  { name: 'Burundi', code: 'BI' },
  { name: 'Cambodia', code: 'KH' },
  { name: 'Cameroon', code: 'CM' },
  { name: 'Canada', code: 'CA' },
  { name: 'Cape Verde', code: 'CV' },
  { name: 'Cayman Islands', code: 'KY' },
  { name: 'Central African Republic', code: 'CF' },
  { name: 'Chad', code: 'TD' },
  { name: 'Chile', code: 'CL' },
  { name: 'China', code: 'CN' },
  { name: 'Christmas Island', code: 'CX' },
  { name: 'Cocos (Keeling) Islands', code: 'CC' },
  { name: 'Colombia', code: 'CO' },
  { name: 'Comoros', code: 'KM' },
  { name: 'Congo', code: 'CG' },
  { name: 'Congo, The Democratic Republic of the', code: 'CD' },
  { name: 'Cook Islands', code: 'CK' },
  { name: 'Costa Rica', code: 'CR' },
  { name: 'Cote D\'Ivoire', code: 'CI' },
  { name: 'Croatia', code: 'HR' },
  { name: 'Cuba', code: 'CU' },
  { name: 'Cyprus', code: 'CY' },
  { name: 'Czech Republic', code: 'CZ' },
  { name: 'Denmark', code: 'DK' },
  { name: 'Djibouti', code: 'DJ' },
  { name: 'Dominica', code: 'DM' },
  { name: 'Dominican Republic', code: 'DO' },
  { name: 'Ecuador', code: 'EC' },
  { name: 'Egypt', code: 'EG' },
  { name: 'El Salvador', code: 'SV' },
  { name: 'Equatorial Guinea', code: 'GQ' },
  { name: 'Eritrea', code: 'ER' },
  { name: 'Estonia', code: 'EE' },
  { name: 'Ethiopia', code: 'ET' },
  { name: 'Falkland Islands (Malvinas)', code: 'FK' },
  { name: 'Faroe Islands', code: 'FO' },
  { name: 'Fiji', code: 'FJ' },
  { name: 'Finland', code: 'FI' },
  { name: 'France', code: 'FR' },
  { name: 'French Guiana', code: 'GF' },
  { name: 'French Polynesia', code: 'PF' },
  { name: 'French Southern Territories', code: 'TF' },
  { name: 'Gabon', code: 'GA' },
  { name: 'Gambia', code: 'GM' },
  { name: 'Georgia', code: 'GE' },
  { name: 'Germany', code: 'DE' },
  { name: 'Ghana', code: 'GH' },
  { name: 'Gibraltar', code: 'GI' },
  { name: 'Greece', code: 'GR' },
  { name: 'Greenland', code: 'GL' },
  { name: 'Grenada', code: 'GD' },
  { name: 'Guadeloupe', code: 'GP' },
  { name: 'Guam', code: 'GU' },
  { name: 'Guatemala', code: 'GT' },
  { name: 'Guernsey', code: 'GG' },
  { name: 'Guinea', code: 'GN' },
  { name: 'Guinea-Bissau', code: 'GW' },
  { name: 'Guyana', code: 'GY' },
  { name: 'Haiti', code: 'HT' },
  { name: 'Heard Island and Mcdonald Islands', code: 'HM' },
  { name: 'Holy See (Vatican City State)', code: 'VA' },
  { name: 'Honduras', code: 'HN' },
  { name: 'Hong Kong', code: 'HK' },
  { name: 'Hungary', code: 'HU' },
  { name: 'Iceland', code: 'IS' },
  { name: 'India', code: 'IN' },
  { name: 'Indonesia', code: 'ID' },
  { name: 'Iran, Islamic Republic Of', code: 'IR' },
  { name: 'Iraq', code: 'IQ' },
  { name: 'Ireland', code: 'IE' },
  { name: 'Isle of Man', code: 'IM' },
  { name: 'Israel', code: 'IL' },
  { name: 'Italy', code: 'IT' },
  { name: 'Jamaica', code: 'JM' },
  { name: 'Japan', code: 'JP' },
  { name: 'Jersey', code: 'JE' },
  { name: 'Jordan', code: 'JO' },
  { name: 'Kazakhstan', code: 'KZ' },
  { name: 'Kenya', code: 'KE' },
  { name: 'Kiribati', code: 'KI' },
  { name: 'Korea, Democratic People\'S Republic of', code: 'KP' },
  { name: 'Korea, Republic of', code: 'KR' },
  { name: 'Kuwait', code: 'KW' },
  { name: 'Kyrgyzstan', code: 'KG' },
  { name: 'Lao People\'S Democratic Republic', code: 'LA' },
  { name: 'Latvia', code: 'LV' },
  { name: 'Lebanon', code: 'LB' },
  { name: 'Lesotho', code: 'LS' },
  { name: 'Liberia', code: 'LR' },
  { name: 'Libyan Arab Jamahiriya', code: 'LY' },
  { name: 'Liechtenstein', code: 'LI' },
  { name: 'Lithuania', code: 'LT' },
  { name: 'Luxembourg', code: 'LU' },
  { name: 'Macao', code: 'MO' },
  { name: 'Macedonia, The Former Yugoslav Republic of', code: 'MK' },
  { name: 'Madagascar', code: 'MG' },
  { name: 'Malawi', code: 'MW' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Maldives', code: 'MV' },
  { name: 'Mali', code: 'ML' },
  { name: 'Malta', code: 'MT' },
  { name: 'Marshall Islands', code: 'MH' },
  { name: 'Martinique', code: 'MQ' },
  { name: 'Mauritania', code: 'MR' },
  { name: 'Mauritius', code: 'MU' },
  { name: 'Mayotte', code: 'YT' },
  { name: 'Mexico', code: 'MX' },
  { name: 'Micronesia, Federated States of', code: 'FM' },
  { name: 'Moldova, Republic of', code: 'MD' },
  { name: 'Monaco', code: 'MC' },
  { name: 'Mongolia', code: 'MN' },
  { name: 'Montserrat', code: 'MS' },
  { name: 'Morocco', code: 'MA' },
  { name: 'Mozambique', code: 'MZ' },
  { name: 'Myanmar', code: 'MM' },
  { name: 'Namibia', code: 'NA' },
  { name: 'Nauru', code: 'NR' },
  { name: 'Nepal', code: 'NP' },
  { name: 'Netherlands', code: 'NL' },
  { name: 'Netherlands Antilles', code: 'AN' },
  { name: 'New Caledonia', code: 'NC' },
  { name: 'New Zealand', code: 'NZ' },
  { name: 'Nicaragua', code: 'NI' },
  { name: 'Niger', code: 'NE' },
  { name: 'Nigeria', code: 'NG' },
  { name: 'Niue', code: 'NU' },
  { name: 'Norfolk Island', code: 'NF' },
  { name: 'Northern Mariana Islands', code: 'MP' },
  { name: 'Norway', code: 'NO' },
  { name: 'Oman', code: 'OM' },
  { name: 'Pakistan', code: 'PK' },
  { name: 'Palau', code: 'PW' },
  { name: 'Palestinian Territory, Occupied', code: 'PS' },
  { name: 'Panama', code: 'PA' },
  { name: 'Papua New Guinea', code: 'PG' },
  { name: 'Paraguay', code: 'PY' },
  { name: 'Peru', code: 'PE' },
  { name: 'Philippines', code: 'PH' },
  { name: 'Pitcairn', code: 'PN' },
  { name: 'Poland', code: 'PL' },
  { name: 'Portugal', code: 'PT' },
  { name: 'Puerto Rico', code: 'PR' },
  { name: 'Qatar', code: 'QA' },
  { name: 'Reunion', code: 'RE' },
  { name: 'Romania', code: 'RO' },
  { name: 'Russian Federation', code: 'RU' },
  { name: 'RWANDA', code: 'RW' },
  { name: 'Saint Helena', code: 'SH' },
  { name: 'Saint Kitts and Nevis', code: 'KN' },
  { name: 'Saint Lucia', code: 'LC' },
  { name: 'Saint Pierre and Miquelon', code: 'PM' },
  { name: 'Saint Vincent and the Grenadines', code: 'VC' },
  { name: 'Samoa', code: 'WS' },
  { name: 'San Marino', code: 'SM' },
  { name: 'Sao Tome and Principe', code: 'ST' },
  { name: 'Saudi Arabia', code: 'SA' },
  { name: 'Senegal', code: 'SN' },
  { name: 'Serbia and Montenegro', code: 'CS' },
  { name: 'Seychelles', code: 'SC' },
  { name: 'Sierra Leone', code: 'SL' },
  { name: 'Singapore', code: 'SG' },
  { name: 'Slovakia', code: 'SK' },
  { name: 'Slovenia', code: 'SI' },
  { name: 'Solomon Islands', code: 'SB' },
  { name: 'Somalia', code: 'SO' },
  { name: 'South Africa', code: 'ZA' },
  { name: 'South Georgia and the South Sandwich Islands', code: 'GS' },
  { name: 'Spain', code: 'ES' },
  { name: 'Sri Lanka', code: 'LK' },
  { name: 'Sudan', code: 'SD' },
  { name: 'Suriname', code: 'SR' },
  { name: 'Svalbard and Jan Mayen', code: 'SJ' },
  { name: 'Swaziland', code: 'SZ' },
  { name: 'Sweden', code: 'SE' },
  { name: 'Switzerland', code: 'CH' },
  { name: 'Syrian Arab Republic', code: 'SY' },
  { name: 'Taiwan, Province of China', code: 'TW' },
  { name: 'Tajikistan', code: 'TJ' },
  { name: 'Tanzania, United Republic of', code: 'TZ' },
  { name: 'Thailand', code: 'TH' },
  { name: 'Timor-Leste', code: 'TL' },
  { name: 'Togo', code: 'TG' },
  { name: 'Tokelau', code: 'TK' },
  { name: 'Tonga', code: 'TO' },
  { name: 'Trinidad and Tobago', code: 'TT' },
  { name: 'Tunisia', code: 'TN' },
  { name: 'Turkey', code: 'TR' },
  { name: 'Turkmenistan', code: 'TM' },
  { name: 'Turks and Caicos Islands', code: 'TC' },
  { name: 'Tuvalu', code: 'TV' },
  { name: 'Uganda', code: 'UG' },
  { name: 'Ukraine', code: 'UA' },
  { name: 'United Arab Emirates', code: 'AE' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'United States', code: 'US' },
  { name: 'United States Minor Outlying Islands', code: 'UM' },
  { name: 'Uruguay', code: 'UY' },
  { name: 'Uzbekistan', code: 'UZ' },
  { name: 'Vanuatu', code: 'VU' },
  { name: 'Venezuela', code: 'VE' },
  { name: 'Viet Nam', code: 'VN' },
  { name: 'Virgin Islands, British', code: 'VG' },
  { name: 'Virgin Islands, U.S.', code: 'VI' },
  { name: 'Wallis and Futuna', code: 'WF' },
  { name: 'Western Sahara', code: 'EH' },
  { name: 'Yemen', code: 'YE' },
  { name: 'Zambia', code: 'ZM' },
  { name: 'Zimbabwe', code: 'ZW' }
]

const languages = [
  { name: "English", code: "en" },
  { name: 'Viet Nam', code: 'VN' },
]

const UpdateChatbotForm = ({ chatbotId, onSubmmited, onCancelled }: { chatbotId: string, onSubmmited?: () => void, onCancelled?: () => void }) => {
  const { t } = useTranslate()
  // const haveListLanguage = _.map(timezones, 'abbr')
  const [viewListLanguages] = useState(languages);

  // const haveListCountries = _.map(timezones, 'value')
  const [viewListCountries] = useState(countries);

  const haveListTimeZone = _.flatMap(timezones, 'utc');
  const [viewListTimeZones] = useState(haveListTimeZone);

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

  const { form, handleSubmitWithAction } = useHookFormAction(updateChatboxAction, zodResolver(updateChatbotSchema), {
    actionProps: {
      onSuccess: (data) => {
        alert("Success")
        toast("Contact update chatbox successfully")
        // onSubmmited && onSubmmited()
        console.log("Success: ", data);
      },
      onError: ({ error }) => {
        console.log("Error: ");
        alert("Error")
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      }
    },
    formProps: {
      mode: "onChange",
      defaultValues: {
        id: "",
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


  // const form = useForm({
  //   defaultValues: {
  //     id: chatbotId,
  //     defaultReply: "",
  //     targetCountry: "",
  //     defaultLanguage: "",
  //     accountTimezone: "",
  //     brandColor: "",
  //     developmentMode: false,
  //   },
  // });

  const { setValue, control } = form;

  const onSubmit = (data: any) => {
    console.log(data);
    // onSubmit={form.handleSubmit(onSubmit)}
    // onSubmit={handleSubmitWithAction}   
  };

  return (
    <div className="">
      <Form {...form}>
        <form className="flex flex-col gap-y-4 pt-4" onSubmit={(e) => {
          e.preventDefault();
          console.log("Form Submitted");
          handleSubmitWithAction(e);
        }}>
          {/* Default Reply */}
          <FormField control={form.control} name="defaultReply" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('contacts.defaultReply')}</FormLabel>
              <FormDescription>FormDesc</FormDescription>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Generic Default Reply" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="default">Generic Default Reply</SelectItem>
                      <SelectItem value="list">
                        SYSTEM - List of frequently asked questions
                      </SelectItem>
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


          {/* Target Country */}
          <FormField control={form.control}
            name="targetCountry" render={({ field }) => (
              <FormItem>
                <FormLabel>Target country</FormLabel>
                <FormDescription>Select a country for your contacts.</FormDescription>
                <FormControl>
                  <Popover open={openCountry} onOpenChange={setOpenCountry}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCountry}
                      // className="w-full justify-between"
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
                            {viewListCountries.map((country, index) => (
                              <CommandItem
                                key={index}
                                value={country.name}
                                onSelect={() => {
                                  field.onChange(country.name);
                                  setOpenCountry(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${field.value === country.name ? "opacity-100" : "opacity-0"
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

          {/* Default Language */}
          <FormField control={form.control}
            name="defaultLanguage" render={({ field }) => (
              <FormItem>
                <FormLabel>Default Language</FormLabel>
                <FormDescription>Card Description</FormDescription>
                <FormControl>
                  <Popover open={openLanguages} onOpenChange={setOpenLanguages}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openLanguages}
                      // className="w-full justify-between"
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
                                value={language.name}
                                onSelect={() => {
                                  field.onChange(language.name);
                                  setOpenLanguages(false)
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${field.value === language.name ? "opacity-100" : "opacity-0"}`}
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

          {/* Time Zone */}
          <FormField control={form.control}
            name="accountTimezone" render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <FormDescription>Card Description</FormDescription>
                <FormControl>
                  <Popover open={openLanguages} onOpenChange={setOpenLanguages}>
                    <Popover open={openTimeZone} onOpenChange={setOpenTimeZone}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openTimeZone}
                        // className="w-full justify-between"
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


          {/* Brand Color */}
          <Card className="md:grid md:grid-cols-12">
            <CardHeader className="col-span-3">
              <FormLabel>Brand Color</FormLabel>
              <FormDescription>Card Description</FormDescription>
            </CardHeader>
            <CardContent className="col-span-4 flex justify-center items-center">
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
            </CardContent>
            <CardFooter className="col-span-5">
              <p className="">
                This color is used on buttons to match your branding on the landing page, emails and webchat.
              </p>
            </CardFooter>
          </Card>

          {/* Development Mode */}
          <FormField control={form.control}
            name="developmentMode" render={({ field }) => (
              <FormItem>
                <FormLabel>Development Mode</FormLabel>
                <FormDescription>Card Description</FormDescription>
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

          {/* Delete Account */}
          <FormField control={form.control}
            name="developmentMode" render={({ field }) => (
              <FormItem>
                <FormLabel>Delete Account</FormLabel>
                <FormDescription>Card Description</FormDescription>
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

export default UpdateChatbotForm
