import {query} from '@/platform/vendure/api';
import {GetTopCollectionsQuery} from './graphql';

export async function getTopCollections(locale: string) {
    const result = await query(GetTopCollectionsQuery, undefined, {languageCode: locale});
    return result.data.collections.items;
}
