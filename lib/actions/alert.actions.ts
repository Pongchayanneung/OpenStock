'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Alert } from '@/database/models/alert.model';
import { revalidatePath } from 'next/cache';
import { requireUserId, validateSymbol } from '@/lib/better-auth/session';
import { isValidObjectId } from 'mongoose';

// Create a new alert
export async function createAlert(params: {
    userId: string;
    symbol: string;
    targetPrice: number;
    condition: 'ABOVE' | 'BELOW';
}) {
    const userId = await requireUserId(params.userId);
    const symbol = validateSymbol(params.symbol);
    if (!Number.isFinite(params.targetPrice) || params.targetPrice <= 0 || !['ABOVE', 'BELOW'].includes(params.condition)) throw new Error('Invalid alert');
    try {
        await connectToDatabase();
        const newAlert = await Alert.create({
            userId, symbol, targetPrice: params.targetPrice, condition: params.condition,
            active: true,
            // expiresAt handled by default value in schema
        });
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(newAlert));
    } catch (error) {
        console.error('Error creating alert:', error);
        throw new Error('Failed to create alert');
    }
}

// Get all alerts for a user
export async function getUserAlerts(userId: string) {
    userId = await requireUserId(userId);
    try {
        await connectToDatabase();
        const alerts = await Alert.find({ userId }).sort({ createdAt: -1 });
        return JSON.parse(JSON.stringify(alerts));
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return [];
    }
}

// Delete an alert
export async function deleteAlert(alertId: string) {
    const userId = await requireUserId();
    if (!isValidObjectId(alertId)) throw new Error('Invalid alert ID');
    try {
        await connectToDatabase();
        const deleted = await Alert.findOneAndDelete({ _id: alertId, userId });
        if (!deleted) throw new Error('Alert not found');
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error deleting alert:', error);
        throw new Error('Failed to delete alert');
    }
}

// Toggle alert active status (optional utility)
export async function toggleAlert(alertId: string, active: boolean) {
    const userId = await requireUserId();
    if (!isValidObjectId(alertId) || typeof active !== 'boolean') throw new Error('Invalid alert');
    try {
        await connectToDatabase();
        const updated = await Alert.findOneAndUpdate({ _id: alertId, userId }, { active });
        if (!updated) throw new Error('Alert not found');
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error toggling alert:', error);
        throw new Error('Failed to update alert');
    }
}
