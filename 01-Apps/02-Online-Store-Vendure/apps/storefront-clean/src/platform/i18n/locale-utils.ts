import type {Locale} from './routing';

const OG_LOCALE_MAP: Record<Locale, string> = { ro: 'ro_RO', en: 'en_US' };
const INTL_LOCALE_MAP: Record<Locale, string> = { ro: 'ro-RO', en: 'en-US' };

export function toOgLocale(locale: string): string {
    return OG_LOCALE_MAP[locale as Locale] || 'ro_RO';
}

export function toIntlLocale(locale: string): string {
    return INTL_LOCALE_MAP[locale as Locale] || 'ro-RO';
}
