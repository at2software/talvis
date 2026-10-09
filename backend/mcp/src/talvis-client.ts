export class TalvisApiError extends Error {
    constructor(
        readonly status: number,
        readonly body: unknown,
    ) {
        const message = typeof body === 'object' && body !== null && 'message' in body ? String((body as { message: unknown }).message) : `HTTP ${status}`;
        super(`TALVIS answered ${status}: ${message}`);
    }
}

export class TalvisClient {
    readonly #baseUrl: string;

    constructor(
        baseUrl: string,
        readonly token: string,
    ) {
        this.#baseUrl = baseUrl.replace(/\/+$/, '');
    }

    async request<T = unknown>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
        const response = await fetch(`${this.#baseUrl}${path}`, {
            method,
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${this.token}`,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        const payload: unknown = text ? JSON.parse(text) : null;
        if (!response.ok) {
            throw new TalvisApiError(response.status, payload);
        }
        return payload as T;
    }
}
