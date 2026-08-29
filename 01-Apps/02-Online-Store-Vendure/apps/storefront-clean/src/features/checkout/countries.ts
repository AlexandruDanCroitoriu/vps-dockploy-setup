import {query} from '@/platform/vendure/api';
import {GetAvailableCountriesQuery} from './graphql';

export async function getAvailableCountriesCached(locale: string) {
    const result = await query(GetAvailableCountriesQuery, undefined, {languageCode: locale});
    return result.data.availableCountries || [];
}
