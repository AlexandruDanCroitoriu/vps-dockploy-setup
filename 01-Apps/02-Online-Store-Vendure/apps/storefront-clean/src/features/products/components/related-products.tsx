import { ProductCarousel } from "@/features/products/components/product-carousel";
import { getRouteLocale } from "@/platform/i18n/server";
import {getActiveCurrencyCode} from '@/features/currency/currency-server';
import { query } from "@/platform/vendure/api";
import {GetCollectionProductsQuery} from '@/features/collections/graphql';
import { readFragment } from "@/platform/vendure/graphql";
import {ProductCardFragment} from '@/features/products/graphql';
import {getTranslations} from 'next-intl/server';

interface RelatedProductsProps {
    collectionSlug: string;
    currentProductId: string;
}

async function getRelatedProducts(collectionSlug: string, currentProductId: string, locale: string, currencyCode: string) {
    const result = await query(GetCollectionProductsQuery, {
        slug: collectionSlug,
        input: {
            collectionSlug: collectionSlug,
            take: 13, // Fetch extra to account for filtering out current product
            skip: 0,
            groupByProduct: true
        }
    }, {languageCode: locale, currencyCode});

    // Filter out the current product and limit to 12
    return result.data.search.items
        .filter(item => {
            const product = readFragment(ProductCardFragment, item);
            return product.productId !== currentProductId;
        })
        .slice(0, 12);
}

export async function RelatedProducts({ collectionSlug, currentProductId }: RelatedProductsProps) {
    const locale = await getRouteLocale();
    const currencyCode = await getActiveCurrencyCode();
    const t = await getTranslations({locale, namespace: 'Product'});
    const products = await getRelatedProducts(collectionSlug, currentProductId, locale, currencyCode);

    if (products.length === 0) {
        return null;
    }

    return (
        <ProductCarousel
            title={t('relatedProducts')}
            products={products}
        />
    );
}
