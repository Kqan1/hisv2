/**
 * Retry wrapper for Gemini API calls.
 * Retries on 503 "high demand" errors with exponential backoff.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2 seconds

function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message || '';
        // Gemini SDK wraps the HTTP status in the error message
        return (
            msg.includes('503') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('high demand') ||
            msg.includes('overloaded') ||
            msg.includes('rate limit')
        );
    }
    return false;
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    label = 'Gemini API'
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < MAX_RETRIES && isRetryableError(error)) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
                console.log(
                    `[RETRY] ${label} attempt ${attempt + 1}/${MAX_RETRIES} failed (503). Retrying in ${delay}ms...`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }

    throw lastError;
}
