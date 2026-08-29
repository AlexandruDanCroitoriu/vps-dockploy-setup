import {getRouteLocale} from '@/platform/i18n/server';
import {getTopCollections} from '@/features/collections/data';
import {
    NavigationMenu,
    NavigationMenuList,
    NavigationMenuItem,
} from '@/components/ui/navigation-menu';
import {NavbarLink} from '@/site/navigation/navbar/navbar-link';

export async function NavbarCollections() {
    const locale = await getRouteLocale();

    const collections = await getTopCollections(locale);

    return (
        <NavigationMenu>
            <NavigationMenuList>
                {collections.map((collection) => (
                    <NavigationMenuItem key={collection.slug}>
                        <NavbarLink href={`/collection/${collection.slug}`}>
                            {collection.name}
                        </NavbarLink>
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>
        </NavigationMenu>
    );
}
