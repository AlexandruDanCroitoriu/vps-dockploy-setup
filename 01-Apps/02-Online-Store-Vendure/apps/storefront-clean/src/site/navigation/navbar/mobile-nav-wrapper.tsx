import {getRouteLocale} from '@/platform/i18n/server';
import {getTopCollections} from '@/features/collections/data';
import {MobileNav} from '@/site/navigation/navbar/mobile-nav';

export async function MobileNavWrapper() {
    const locale = await getRouteLocale();

    const collections = await getTopCollections(locale);

    return <MobileNav collections={collections} />;
}
