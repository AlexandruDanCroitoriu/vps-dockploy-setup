import type {Metadata} from "next";
import Image from "next/image";
import {getRouteLocale} from "@/platform/i18n/server";
import {getTopCollections} from '@/features/collections/data';
import {NavigationLink} from '@/site/navigation/navigation-link';
import {SITE_NAME, SITE_URL, buildCanonicalUrl} from "@/config/metadata";
import {getTranslations} from 'next-intl/server';
import {toOgLocale} from '@/platform/i18n/locale-utils';

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRouteLocale();
    const t = await getTranslations({locale, namespace: 'Home'});
    const ogLocale = toOgLocale(locale);

    return {
        title: {
            absolute: `${SITE_NAME} - ${t('pageTitle')}`,
        },
        description: t('description'),
        alternates: {
            canonical: buildCanonicalUrl("/"),
        },
        openGraph: {
            title: `${SITE_NAME} - ${t('pageTitle')}`,
            description: t('ogDescription'),
            type: "website",
            locale: ogLocale,
            url: SITE_URL,
        },
    };
}

export default async function Home() {
    const locale = await getRouteLocale();
    const t = await getTranslations({locale, namespace: 'Home'});
    const collections = await getTopCollections(locale);

    return (
        <main className="container mx-auto flex-1 px-4 pb-16 pt-28">
            <div className="mb-10 max-w-2xl">
                <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{t('collectionsTitle')}</h1>
                <p className="mt-3 text-muted-foreground md:text-lg">{t('collectionsDescription')}</p>
            </div>

            {collections.length === 0 ? (
                <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                    {t('noCollections')}
                </p>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {collections.map((collection) => (
                        <NavigationLink
                            key={collection.id}
                            href={`/collection/${collection.slug}`}
                            className="group overflow-hidden rounded-xl border bg-card transition hover:-translate-y-1 hover:shadow-lg"
                        >
                            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                                {collection.featuredAsset?.preview ? (
                                    <Image
                                        src={collection.featuredAsset.preview}
                                        alt=""
                                        fill
                                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                                        className="object-cover transition duration-300 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                        {t('noImage')}
                                    </div>
                                )}
                            </div>
                            <h2 className="p-5 text-xl font-semibold">{collection.name}</h2>
                        </NavigationLink>
                    ))}
                </div>
            )}
        </main>
    );
}
