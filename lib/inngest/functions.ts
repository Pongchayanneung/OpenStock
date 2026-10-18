import { inngest, backgroundJobsEnabled } from '@/lib/inngest/client';
import { PERSONALIZED_WELCOME_EMAIL_PROMPT, NEWS_SUMMARY_EMAIL_PROMPT } from '@/lib/inngest/prompts';
import { sendWelcomeEmail, sendNotification } from '@/lib/nodemailer';
import { getAllUsersForNewsEmail } from '@/lib/actions/user.actions';
import { getNews, getQuote } from '@/lib/finnhub';
import { callAIProviderWithFallback } from '@/lib/ai-provider';
import { connectToDatabase } from '@/database/mongoose';
import { Alert } from '@/database/models/alert.model';
import { ObjectId } from 'mongodb';

const hasAI = Boolean(process.env.GEMINI_API_KEY || process.env.MINIMAX_API_KEY || process.env.SIRAY_API_KEY);

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email' }, { event: 'app/user.created' },
    async ({ event, step }) => {
        if (!backgroundJobsEnabled) return { status: 'disabled' };
        const intro = await step.run('generate-welcome-intro', async () => {
            if (!hasAI) return 'Welcome to OpenStock. Track your stocks, news and price alerts.';
            const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', JSON.stringify({
                country: event.data.country, investmentGoals: event.data.investmentGoals,
                riskTolerance: event.data.riskTolerance, preferredIndustry: event.data.preferredIndustry,
            }));
            return callAIProviderWithFallback(prompt);
        });
        return step.run('send-welcome-email', () => sendWelcomeEmail({
            email: event.data.email, name: event.data.name, intro,
        }));
    },
);

export const sendWeeklyNewsSummary = inngest.createFunction(
    { id: 'weekly-news-summary', concurrency: { limit: 1 } },
    [{ event: 'app/send.weekly.news' }, { cron: '0 9 * * 1' }],
    async ({ step }) => {
        if (!backgroundJobsEnabled || !hasAI) return { status: 'disabled' };
        const articles = await step.run('fetch-news', () => getNews());
        if (!articles?.length) return { status: 'no-news' };
        const summary = await step.run('generate-summary', () => callAIProviderWithFallback(
            NEWS_SUMMARY_EMAIL_PROMPT.replace('{{newsData}}', JSON.stringify(articles.slice(0, 10))),
        ));
        const users = await step.run('fetch-users', getAllUsersForNewsEmail);
        for (const user of users) {
            await step.run(`send-summary-${user.id}`, () => sendNotification(
                user.email, 'OpenStock weekly market summary', summary,
            ));
        }
        return { sent: users.length };
    },
);

export const checkStockAlerts = inngest.createFunction(
    { id: 'check-stock-alerts', concurrency: { limit: 1 } }, { cron: '*/5 * * * *' },
    async ({ step }) => {
        if (!backgroundJobsEnabled) return { status: 'disabled' };
        const alerts = await step.run('fetch-active-alerts', async () => {
            await connectToDatabase();
            const rows = await Alert.find({ active: true, triggered: false, expiresAt: { $gt: new Date() } }).lean();
            return rows.map(row => ({ id: String(row._id), userId: row.userId, symbol: row.symbol,
                targetPrice: row.targetPrice, condition: row.condition }));
        });
        const prices = await step.run('fetch-prices', async () => {
            const result: Record<string, number> = {};
            for (const symbol of new Set(alerts.map(alert => alert.symbol))) {
                const quote = await getQuote(symbol);
                if (quote?.c && Number.isFinite(quote.c)) result[symbol] = quote.c;
            }
            return result;
        });
        let sent = 0;
        let failed = 0;
        for (const alert of alerts) {
            const price = prices[alert.symbol];
            if (!price || !(alert.condition === 'ABOVE' ? price >= alert.targetPrice : price <= alert.targetPrice)) continue;
            try {
            const delivered = await step.run(`send-alert-${alert.id}`, async () => {
                const mongoose = await connectToDatabase();
                const current = await Alert.findOne({ _id: alert.id, active: true, triggered: false, expiresAt: { $gt: new Date() } });
                if (!current) return false;
                const db = mongoose.connection.db;
                if (!db) throw new Error('Database unavailable');
                const user = await db.collection('user').findOne(ObjectId.isValid(alert.userId)
                    ? { $or: [{ id: alert.userId }, { _id: new ObjectId(alert.userId) }] }
                    : { id: alert.userId });
                if (typeof user?.email !== 'string' || !user.email) throw new Error('Alert recipient unavailable');
                // ponytail: SMTP is at-least-once; ambiguous delivery may duplicate, use provider idempotency if required.
                await sendNotification(user.email, `OpenStock price alert: ${alert.symbol}`,
                    `${alert.symbol}: ${price}, target ${alert.condition.toLowerCase()} ${alert.targetPrice}.`,
                    `<openstock-alert-${alert.id}@openstock.local>`);
                return true;
            });
            if (delivered) {
                // A separate durable step retries the DB update without resending a successful mail step.
                await step.run(`mark-alert-${alert.id}`, async () => {
                    await connectToDatabase();
                    await Alert.updateOne({ _id: alert.id, userId: alert.userId }, { triggered: true, active: false });
                });
                sent++;
            }
            } catch {
                failed++;
            }
        }
        if (failed) throw new Error(`${failed} alert deliveries failed; retry required`);
        return { processed: alerts.length, sent };
    },
);

export const checkInactiveUsers = inngest.createFunction(
    { id: 'check-inactive-users', concurrency: { limit: 1 } }, { cron: '0 10 * * *' },
    async ({ step }) => {
        if (!backgroundJobsEnabled) return { status: 'disabled' };
        const users = await step.run('fetch-inactive-users', async () => {
            const mongoose = await connectToDatabase();
            const db = mongoose.connection.db;
            if (!db) throw new Error('Database unavailable');
            const cutoff = new Date(Date.now() - 30 * 86400000);
            const rows = await db.collection('user').find({ $and: [
                { $or: [{ lastActiveAt: { $lt: cutoff } }, { lastActiveAt: { $exists: false }, createdAt: { $lt: cutoff } }] },
                { $or: [{ lastReengagementSentAt: { $exists: false } }, { lastReengagementSentAt: { $lt: cutoff } }] },
            ] }, { projection: { email: 1, _id: 1 } }).limit(50).toArray();
            return rows.filter(row => typeof row.email === 'string' && row.email)
                .map(row => ({ id: String(row._id), email: String(row.email) }));
        });
        for (const user of users) {
            await step.run(`send-reengagement-${user.id}`, () => sendNotification(
                user.email, 'Your OpenStock dashboard is ready', 'Visit your dashboard to review your watchlist and market news.',
            ));
            await step.run(`mark-reengagement-${user.id}`, async () => {
                const mongoose = await connectToDatabase();
                if (!mongoose.connection.db) throw new Error('Database unavailable');
                await mongoose.connection.db.collection('user').updateOne(
                    { _id: new ObjectId(user.id) }, { $set: { lastReengagementSentAt: new Date() } },
                );
            });
        }
        return { sent: users.length };
    },
);
