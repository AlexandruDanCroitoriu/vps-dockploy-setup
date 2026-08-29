import type {Metadata, Viewport} from "next";
import Script from "next/script";
import {connection} from "next/server";
import {Suspense} from "react";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {Geist, Geist_Mono} from "next/font/google";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {routing} from "@/platform/i18n/routing";
import {toOgLocale} from "@/platform/i18n/locale-utils";
import {getRouteLocale} from "@/platform/i18n/server";
import {Toaster} from "@/components/ui/sonner";
import {Navbar} from '@/site/navigation/navbar';
import {Footer} from "@/site/footer";
import {ThemeProvider} from "@/site/providers/theme-provider";
import {SITE_NAME, SITE_URL} from "@/config/metadata";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export function generateStaticParams() {
    return routing.locales.map((locale) => ({locale}));
}

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRouteLocale();
    const ogLocale = toOgLocale(locale);
    const t = await getTranslations({locale, namespace: 'Common'});

    return {
        metadataBase: new URL(SITE_URL),
        title: {
            default: SITE_NAME,
            template: `%s | ${SITE_NAME}`,
        },
        description: t('siteDescription', {siteName: SITE_NAME}),
        openGraph: {
            type: "website",
            siteName: SITE_NAME,
            locale: ogLocale,
        },
        twitter: {
            card: "summary_large_image",
        },
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                "max-video-preview": -1,
                "max-image-preview": "large",
                "max-snippet": -1,
            },
        },
        alternates: {
            languages: Object.fromEntries(
                routing.locales.map((l) => [l, `/${l}`])
            ),
        },
    };
}

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: [
        {media: "(prefers-color-scheme: light)", color: "#ffffff"},
        {media: "(prefers-color-scheme: dark)", color: "#000000"},
    ],
};

async function RuntimeStorefront({
    children,
    locale,
    messages,
}: {
    children: React.ReactNode;
    locale: string;
    messages: Awaited<ReturnType<typeof getMessages>>;
}) {
    await connection();

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <ThemeProvider>
                <Navbar />
                {children}
                <Footer/>
                <Toaster/>
            </ThemeProvider>
        </NextIntlClientProvider>
    );
}

export default async function LocaleLayout({children}: {children: React.ReactNode}) {
    const locale = await getRouteLocale();

    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    setRequestLocale(locale);
    const messages = await getMessages({locale});

    return (
        <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
            <head>
                <Script id="theme-init" strategy="beforeInteractive">{`
                    (() => {
                        const stored = localStorage.getItem('theme') || 'system';
                        const theme = stored === 'system'
                            ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                            : stored;
                        document.documentElement.classList.add(theme);
                        document.documentElement.style.colorScheme = theme;
                    })();
                `}</Script>
            </head>
            <body
                suppressHydrationWarning
                className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
            >
                <Suspense fallback={null}>
                    <RuntimeStorefront locale={locale} messages={messages}>
                        {children}
                    </RuntimeStorefront>
                </Suspense>
            </body>
        </html>
    );
}
