#!/usr/bin/env node
import { createServer as createHttpServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const baseUrl = process.env.TALVIS_URL;
if (!baseUrl) {
    console.error('TALVIS_URL is not set (e.g. https://talvis.example.com/backend/api).');
    process.exit(1);
}
const envToken = process.env.TALVIS_MACHINE_TOKEN;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

const bearer = (headers: Record<string, string | string[] | undefined> | undefined): string | undefined => {
    const value = headers?.['authorization'];
    const header = Array.isArray(value) ? value[0] : value;
    return header?.match(/^Bearer\s+(.+)$/i)?.[1];
};

if (process.argv.includes('--http')) {
    const port = Number(process.env.PORT ?? 3333);
    const host = process.env.HOST ?? '127.0.0.1';
    const fallbackToken = LOOPBACK_HOSTS.includes(host) ? envToken : undefined;
    createHttpServer(async (req, res) => {
        if (req.url?.split('?')[0] !== '/mcp') {
            res.writeHead(404).end();
            return;
        }
        const server = createServer({ baseUrl, tokenFor: (headers) => bearer(headers) ?? fallbackToken });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
    }).listen(port, host, () => console.error(`talvis-flow MCP listening on http://${host}:${port}/mcp`));
} else {
    if (!envToken) {
        console.error('TALVIS_MACHINE_TOKEN is not set.');
        process.exit(1);
    }
    const server = createServer({ baseUrl, tokenFor: () => envToken });
    await server.connect(new StdioServerTransport());
}
