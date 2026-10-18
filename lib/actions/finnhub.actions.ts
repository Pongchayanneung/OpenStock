'use server';
import * as market from '@/lib/finnhub';
import { requireUserId, validateSymbol } from '@/lib/better-auth/session';
function validateSymbols(symbols: string[]) {
    if (!Array.isArray(symbols) || symbols.length > 50) throw new Error('Invalid symbol list');
    return symbols.map(validateSymbol);
}
export async function getQuote(symbol: string) {
    await requireUserId();
    return market.getQuote(validateSymbol(symbol));
}
export async function getCompanyProfile(symbol: string) {
    await requireUserId();
    return market.getCompanyProfile(validateSymbol(symbol));
}
export async function getWatchlistData(symbols: string[]) {
    await requireUserId();
    return market.getWatchlistData(validateSymbols(symbols));
}
export async function getNews(symbols?: string[]) {
    await requireUserId();
    return market.getNews(symbols === undefined ? undefined : validateSymbols(symbols));
}
export async function searchStocks(query?: string) {
    await requireUserId();
    if (query !== undefined && (typeof query !== 'string' || query.length > 100)) throw new Error('Invalid search query');
    return market.searchStocks(query);
}
