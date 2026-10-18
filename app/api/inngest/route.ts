import { serve } from "inngest/next";
import { inngest, backgroundJobsEnabled } from "@/lib/inngest/client";
import { sendWeeklyNewsSummary, sendSignUpEmail, checkStockAlerts, checkInactiveUsers } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: backgroundJobsEnabled ? [sendSignUpEmail, sendWeeklyNewsSummary, checkStockAlerts, checkInactiveUsers] : [],
})