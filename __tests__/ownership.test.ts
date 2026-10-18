import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    session: vi.fn(), create: vi.fn(), find: vi.fn(), delete: vi.fn(), update: vi.fn(), connect: vi.fn(),
}));
vi.mock('@/lib/better-auth/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/database/mongoose', () => ({ connectToDatabase: mocks.connect }));
vi.mock('@/database/models/alert.model', () => ({ Alert: {
    create: mocks.create, find: mocks.find, findOneAndDelete: mocks.delete, findOneAndUpdate: mocks.update,
} }));
vi.mock('@/database/models/watchlist.model', () => ({ Watchlist: {
    findOneAndUpdate: mocks.update, findOneAndDelete: mocks.delete, find: mocks.find, findOne: mocks.find,
} }));
import { createAlert, deleteAlert, toggleAlert, getUserAlerts } from '@/lib/actions/alert.actions';
import { addToWatchlist, removeFromWatchlist, getUserWatchlist, isStockInWatchlist } from '@/lib/actions/watchlist.actions';
const id = '507f1f77bcf86cd799439011';
beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: 'owner' } });
    mocks.create.mockImplementation(async value => value);
    mocks.delete.mockResolvedValue({}); mocks.update.mockResolvedValue({});
});
it('rejects unauthenticated and cross-user CRUD before database calls', async () => {
    for (const requestedId of ['other', 'owner']) {
        mocks.session.mockResolvedValue(requestedId === 'owner' ? null : { user: { id: 'owner' } });
        for (const action of [
            () => createAlert({ userId: requestedId, symbol: 'AAPL', targetPrice: 10, condition: 'ABOVE' }),
            () => getUserAlerts(requestedId), () => addToWatchlist(requestedId, 'AAPL', 'Apple'),
            () => removeFromWatchlist(requestedId, 'AAPL'), () => getUserWatchlist(requestedId),
            () => isStockInWatchlist(requestedId, 'AAPL'),
        ]) await expect(action()).rejects.toThrow();
    }
    expect(mocks.connect).not.toHaveBeenCalled();
});
it('scopes ID-only mutations to session owner', async () => {
    await deleteAlert(id); await toggleAlert(id, true);
    expect(mocks.delete).toHaveBeenCalledWith({ _id: id, userId: 'owner' });
    expect(mocks.update).toHaveBeenCalledWith({ _id: id, userId: 'owner' }, { active: true });
});
it('rejects invalid price, condition and symbol without writing', async () => {
    for (const price of [0, -1, NaN, Infinity]) await expect(createAlert({
        userId: 'owner', symbol: 'AAPL', targetPrice: price, condition: 'ABOVE',
    })).rejects.toThrow('Invalid alert');
    await expect(addToWatchlist('owner', '$where', 'Apple')).rejects.toThrow('Invalid stock symbol');
    await expect(createAlert({ userId: 'owner', symbol: 'AAPL', targetPrice: 10, condition: 'WRONG' as 'ABOVE' })).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
});
it('does not persist caller-provided privilege fields', async () => {
    const params = { userId: 'owner', symbol: 'aapl', targetPrice: 10, condition: 'ABOVE' as const, triggered: true };
    await createAlert(params);
    expect(mocks.create).toHaveBeenCalledWith({ userId: 'owner', symbol: 'AAPL', targetPrice: 10, condition: 'ABOVE', active: true });
});

it('requires authentication for market data and sentiment provider actions', async () => {
    mocks.session.mockResolvedValue(null);
    const market = await import('@/lib/actions/finnhub.actions');
    const { getStockSentimentInsights } = await import('@/lib/actions/adanos.actions');
    for (const action of [() => market.getQuote('AAPL'), () => market.getCompanyProfile('AAPL'),
        () => market.getNews(), () => market.searchStocks('AAPL'), () => market.getWatchlistData(['AAPL']),
        () => getStockSentimentInsights('AAPL')]) await expect(action()).rejects.toThrow('Authentication required');
});
