import {Inngest} from "inngest"

export const inngest = new Inngest({
    id: "openStock",
    ai: {gemini: {apiKey: process.env.GEMINI_API_KEY}},
    // Add signing key for Vercel deployment
    signingKey: process.env.INNGEST_SIGNING_KEY,
})

export const backgroundJobsEnabled = process.env.OPENSTOCK_ENABLE_EMAIL_JOBS === 'true'
    && Boolean(process.env.NODEMAILER_EMAIL && process.env.NODEMAILER_PASSWORD
        && process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY);
