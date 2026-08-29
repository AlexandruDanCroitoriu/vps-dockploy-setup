import {CartIcon} from './cart-icon';
import {query} from '@/platform/vendure/api';
import {GetActiveOrderQuery} from '@/features/cart/graphql';

export async function NavbarCart() {
    const orderResult = await query(GetActiveOrderQuery, undefined, {
        useAuthToken: true,
        tags: ['cart'],
    });

    const cartItemCount = orderResult.data.activeOrder?.totalQuantity || 0;

    return <CartIcon cartItemCount={cartItemCount} />;
}
