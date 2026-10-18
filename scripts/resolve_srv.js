import dns from 'node:dns/promises';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is missing');
    const parsed = new URL(uri);
    if (parsed.protocol !== 'mongodb+srv:') {
        console.log('Standard MongoDB URI configured; SRV resolution not required.');
        return;
    }
    const records = await dns.resolveSrv(`_mongodb._tcp.${parsed.hostname}`);
    console.log(`Resolved ${records.length} MongoDB hosts; credentials were not displayed or written.`);
}
main().catch(() => { console.error('MongoDB SRV check failed'); process.exitCode = 1; });
