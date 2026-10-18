import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

export async function requireUserId(requestedId?: string) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) throw new Error('Authentication required');
    if (requestedId !== undefined && requestedId !== session.user.id) throw new Error('Access denied');
    return session.user.id;
}

export function validateSymbol(symbol: string) {
    if (typeof symbol !== 'string' || !/^[A-Z0-9][A-Z0-9.:-]{0,29}$/i.test(symbol)) {
        throw new Error('Invalid stock symbol');
    }
    return symbol.toUpperCase();
}
