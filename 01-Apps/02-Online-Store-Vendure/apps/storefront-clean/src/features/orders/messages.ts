import type {MessageLoaders} from '@/platform/i18n/messages';

export const ordersMessageLoaders: MessageLoaders = {
    en: () => import('./messages/en.json'),
    ro: () => import('./messages/ro.json'),
};
