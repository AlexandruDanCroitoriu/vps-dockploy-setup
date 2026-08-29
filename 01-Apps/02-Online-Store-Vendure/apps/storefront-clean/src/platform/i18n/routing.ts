import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
    locales: ['ro', 'en'],
    defaultLocale: 'ro',
});

export type Locale = (typeof routing.locales)[number];

export const localeNames: Record<Locale, string> = {
    en: 'English',
    ro: 'Română',
};
