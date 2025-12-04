import { DetectedEntity, DetectResponse } from './types.js';

/**
 * Client for the Python detection API (backend/app/main.py)
 */

export const API_BASE = 'https://localhost:8100';

export class ApiError extends Error {}

export async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Send every paragraph in one request and get back the sensitive spans for each
 */
export async function detectSensitiveData(paragraphs: string[]): Promise<DetectedEntity[][]> {
    let response: Response;
    try {
        response = await fetch(`${API_BASE}/api/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paragraphs }),
        });
    } catch {
        throw new ApiError(`Detection service is not reachable at ${API_BASE}. Is \`npm run api\` running?`);
    }

    if (!response.ok) {
        throw new ApiError(`Detection service returned ${response.status} ${response.statusText}`);
    }

    const data: DetectResponse = await response.json();
    return data.paragraphs;
}
