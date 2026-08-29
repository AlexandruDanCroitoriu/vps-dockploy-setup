import {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/site/i18n/request.ts');

const nextConfig: NextConfig = {
    async redirects() {
        return [
            {
                source: '/verify',
                destination: '/en/verify',
                permanent: false,
            },
        ];
    },
    images: {
        // Vendure supplies the asset origin at runtime, after this reusable
        // image has already been built and published to a Dockploy instance.
        unoptimized: true,
    }
};

export default withNextIntl(nextConfig);
