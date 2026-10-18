#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const required = ['MONGODB_URI', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_FINNHUB_API_KEY'];
const optional = ['GEMINI_API_KEY', 'MINIMAX_API_KEY', 'SIRAY_API_KEY', 'NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'];
let missing = 0;
for (const key of required) {
    const present = Boolean(process.env[key]?.trim());
    console.log(`${key}: ${present ? 'configured' : 'missing (required)'}`);
    if (!present) missing++;
}
for (const key of optional) console.log(`${key}: ${process.env[key]?.trim() ? 'configured' : 'not configured (optional)'}`);
const enabled = process.env.OPENSTOCK_ENABLE_EMAIL_JOBS === 'true';
console.log(`Email jobs: ${enabled ? 'requested' : 'disabled'}`);
if (enabled && ['NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'].some(key => !process.env[key]?.trim())) {
    console.log('Email jobs cannot run: missing mail/Inngest configuration');
    missing++;
}
process.exitCode = missing ? 1 : 0;
