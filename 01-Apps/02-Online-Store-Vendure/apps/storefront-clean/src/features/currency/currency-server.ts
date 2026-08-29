import {getCurrencyCookie} from './currency';
import {getActiveChannel} from '@/platform/vendure/channel';

/**
 * Get the active currency code for the current request.
 * Reads from cookie, falls back to channel default.
 *
 * This storefront is request-rendered, so the currency cookie is read directly.
 */
export async function getActiveCurrencyCode(): Promise<string> {
    const cookieValue = await getCurrencyCookie();
    if (cookieValue) return cookieValue;

    const channel = await getActiveChannel();
    return channel.defaultCurrencyCode;
}
