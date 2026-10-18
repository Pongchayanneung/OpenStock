import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ mail: vi.fn(), mark: vi.fn(), current: vi.fn(), quote: vi.fn(), alerts: vi.fn() }));
vi.mock('@/lib/inngest/client', () => ({ backgroundJobsEnabled: true, inngest: { createFunction: (_options: unknown, _triggers: unknown, handler: unknown) => handler } }));
vi.mock('@/lib/nodemailer', () => ({ sendWelcomeEmail: vi.fn(), sendNotification: mocks.mail }));
vi.mock('@/lib/actions/user.actions', () => ({ getAllUsersForNewsEmail: vi.fn() }));
vi.mock('@/lib/finnhub', () => ({ getNews: vi.fn(), getQuote: mocks.quote }));
vi.mock('@/lib/ai-provider', () => ({ callAIProviderWithFallback: vi.fn() }));
vi.mock('@/database/mongoose', () => ({ connectToDatabase: async () => ({ connection: { db: { collection: () => ({ findOne: async () => ({ email: 'owner@example.com' }) }) } } }) }));
vi.mock('@/database/models/alert.model', () => ({ Alert: {
    find: () => ({ lean: mocks.alerts }),
    findOne: mocks.current, updateOne: mocks.mark,
} }));
beforeEach(() => { vi.clearAllMocks(); mocks.current.mockResolvedValue({}); mocks.quote.mockResolvedValue({ c: 20 }); mocks.alerts.mockResolvedValue([{ _id: 'alert-1', userId: 'owner', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 10 }]); });
it('failed delivery stays untriggered; retries reuse a successful send when DB update fails', async () => {
    vi.stubEnv('OPENSTOCK_ENABLE_EMAIL_JOBS', 'true');
    for (const key of ['NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY']) vi.stubEnv(key, 'test');
    vi.resetModules();
    const { checkStockAlerts } = await import('@/lib/inngest/functions');
    const run = checkStockAlerts as unknown as (context: { step: { run: (name: string, fn: () => unknown) => Promise<unknown> } }) => Promise<unknown>;
    const memo = new Map<string, unknown>();
    const step = { run: async (name: string, fn: () => unknown) => {
        if (memo.has(name)) return memo.get(name);
        const value = await fn(); memo.set(name, value); return value;
    } };
    try {
        mocks.mail.mockRejectedValueOnce(new Error('SMTP unavailable'));
        await expect(run({ step })).rejects.toThrow('retry required');
        expect(mocks.mark).not.toHaveBeenCalled();
        mocks.mail.mockResolvedValue('message'); mocks.mark.mockRejectedValueOnce(new Error('DB unavailable'));
        await expect(run({ step })).rejects.toThrow('retry required');
        mocks.mark.mockResolvedValue({});
        await expect(run({ step })).resolves.toEqual({ processed: 1, sent: 1 });
        expect(mocks.mail).toHaveBeenCalledTimes(2);
        expect(mocks.mail.mock.calls[1][0]).toBe('owner@example.com');
    } finally { vi.unstubAllEnvs(); }
});

it('continues delivery for later users when one mail fails', async () => {
    vi.stubEnv('OPENSTOCK_ENABLE_EMAIL_JOBS', 'true');
    for (const key of ['NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY']) vi.stubEnv(key, 'test');
    vi.resetModules();
    mocks.alerts.mockResolvedValue([
        { _id: 'first', userId: 'owner', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 10 },
        { _id: 'second', userId: 'other', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 10 },
    ]);
    mocks.mail.mockRejectedValueOnce(new Error('SMTP failure')).mockResolvedValue('sent');
    mocks.mark.mockResolvedValue({});
    try {
        const { checkStockAlerts } = await import('@/lib/inngest/functions');
        const run = checkStockAlerts as unknown as (context: { step: { run: (name: string, fn: () => unknown) => Promise<unknown> } }) => Promise<unknown>;
        await expect(run({ step: { run: async (_name, fn) => await fn() } })).rejects.toThrow('retry required');
        expect(mocks.mail).toHaveBeenCalledTimes(2);
        expect(mocks.mark).toHaveBeenCalledTimes(1);
        expect(mocks.mark).toHaveBeenCalledWith({ _id: 'second', userId: 'other' }, { triggered: true, active: false });
    } finally { vi.unstubAllEnvs(); }
});
