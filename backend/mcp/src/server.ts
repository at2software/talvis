import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TalvisApiError, TalvisClient } from './talvis-client.js';

export interface ServerOptions {
    baseUrl: string;
    tokenFor: (headers: Record<string, string | string[] | undefined> | undefined) => string | undefined;
}

type Headers = Record<string, string | string[] | undefined> | undefined;
type Call = (client: TalvisClient) => Promise<unknown>;

const jobId = z.number().int().positive().describe('ID of the flow job');

export function createServer({ baseUrl, tokenFor }: ServerOptions): McpServer {
    const server = new McpServer({ name: 'talvis-flow', version: '0.1.0' });

    const client = (headers: Headers): TalvisClient => {
        const token = tokenFor(headers);
        if (!token) {
            throw new Error('No TALVIS machine token: set TALVIS_MACHINE_TOKEN or send "Authorization: Bearer <token>".');
        }
        return new TalvisClient(baseUrl, token);
    };

    const tool = async (headers: Headers, call: Call): Promise<CallToolResult> => {
        try {
            const result = await call(client(headers));
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
            const text = error instanceof TalvisApiError ? `${error.message}\n${JSON.stringify(error.body, null, 2)}` : String(error instanceof Error ? error.message : error);
            return { content: [{ type: 'text', text }], isError: true };
        }
    };

    const resource = async (uri: URL, headers: Headers, call: Call): Promise<ReadResourceResult> => ({
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await call(client(headers)), null, 2) }],
    });

    server.registerTool(
        'flow_list_open_jobs',
        {
            title: 'List open jobs',
            description: 'Lists development jobs waiting to be claimed (GET /flow/jobs?state=open). Needs flow:jobs:read.',
            inputSchema: { type: z.string().optional().describe('Only jobs of this job type key, e.g. care_fix'), limit: z.number().int().min(1).max(100).optional() },
            annotations: { readOnlyHint: true },
        },
        ({ type, limit }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('GET', `/flow/jobs?${new URLSearchParams({ state: 'open', ...(type ? { type } : {}), ...(limit ? { limit: String(limit) } : {}) })}`)),
    );

    server.registerTool(
        'flow_list_my_jobs',
        {
            title: 'List my jobs',
            description: 'Lists jobs this machine holds in a given state (GET /flow/jobs?state=…). For claimed and running TALVIS filters on the calling machine by default; use it after a restart to pick up your own work. Needs flow:jobs:read.',
            inputSchema: {
                state: z.enum(['claimed', 'running', 'awaiting_gate', 'in_review']).describe('Job state; claimed and running are filtered to this machine'),
                claimed_by: z.string().optional().describe('Another machine name, only needed to look at foreign claims'),
                limit: z.number().int().min(1).max(100).optional(),
            },
            annotations: { readOnlyHint: true },
        },
        ({ state, claimed_by, limit }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('GET', `/flow/jobs?${new URLSearchParams({ state, ...(claimed_by ? { claimed_by } : {}), ...(limit ? { limit: String(limit) } : {}) })}`)),
    );

    server.registerTool(
        'flow_claim_job',
        {
            title: 'Claim a job',
            description: 'Claims an open job for this machine (POST /flow/jobs/{id}/claim). Atomic: a job already claimed by someone else answers 409. Needs flow:jobs:write.',
            inputSchema: { job_id: jobId },
        },
        ({ job_id }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('POST', `/flow/jobs/${job_id}/claim`)),
    );

    server.registerTool(
        'flow_request_gate',
        {
            title: 'Request a gate decision',
            description: 'Asks humans to decide a gate of the project\'s current phase (POST /flow/jobs/{id}/gate-request). The job waits in awaiting_gate until a person decides. Machines can only ask, never decide. Needs flow:jobs:write.',
            inputSchema: {
                job_id: jobId,
                gate_key: z.string().describe('Key of a gate in the project\'s current phase, e.g. architecture or release'),
                options: z.array(z.string()).max(10).optional().describe('Alternatives the deciding person can choose from'),
                recommendation: z.string().max(2000).optional().describe('Which option you recommend and why'),
                source: z.enum(['agent', 'rule_check']).optional().describe('agent: the agent decided to ask; rule_check: an escalation rule forced the request'),
                diff_url: z.string().url().optional().describe('Link to the diff the person should look at (http/https)'),
            },
        },
        ({ job_id, ...body }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('POST', `/flow/jobs/${job_id}/gate-request`, body)),
    );

    server.registerTool(
        'flow_get_gate_decision',
        {
            title: 'Get gate decisions',
            description: 'Returns every approval of a job — gate requests and reviews — with decision (pending, approved, rejected, changes_requested, withdrawn), selected option, reason and review_round (null for gate requests) (GET /flow/jobs/{id}/gates). On changes_requested the job is running again; read the reason, fix and report again. Needs flow:gates:read.',
            inputSchema: { job_id: jobId },
            annotations: { readOnlyHint: true },
        },
        ({ job_id }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('GET', `/flow/jobs/${job_id}/gates`)),
    );

    server.registerTool(
        'flow_report_result',
        {
            title: 'Report a job result',
            description: 'Reports the result of a claimed or running job (POST /flow/jobs/{id}/result). The job goes to in_review and TALVIS opens the review approvals of its job type for humans; it is completed when all are approved, rejected on a rejection, and running again on changes_requested. Without applicable review gates it completes at once. Needs flow:jobs:write.',
            inputSchema: {
                job_id: jobId,
                mr_url: z.string().url().optional().describe('Merge request with the change'),
                mr_urls: z.array(z.string().url()).max(20).optional().describe('All merge requests when the change spans several repositories'),
                test_report: z.string().max(65535).optional().describe('Test summary as text'),
                metrics: z.record(z.string(), z.number()).optional().describe('Measured numbers, e.g. {"duration_minutes": 14, "cost_eur": 0.37}'),
                knowledge: z.record(z.string(), z.unknown()).optional().describe('Findings worth keeping, e.g. root cause, pitfalls'),
            },
        },
        ({ job_id, ...body }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('POST', `/flow/jobs/${job_id}/result`, body)),
    );

    server.registerTool(
        'flow_fail_job',
        {
            title: 'Fail a job',
            description: 'Marks a claimed, running, waiting (awaiting_gate) or in_review job as failed with a reason (POST /flow/jobs/{id}/fail); open approvals of the job are withdrawn. Final. Needs flow:jobs:write.',
            inputSchema: { job_id: jobId, reason: z.string().min(1).max(2000) },
            annotations: { destructiveHint: true },
        },
        ({ job_id, reason }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('POST', `/flow/jobs/${job_id}/fail`, { reason })),
    );

    server.registerTool(
        'flow_list_transitions',
        {
            title: 'List state transitions',
            description: 'Lists the allowed project state transitions (GET /flow/transitions). Needs flow:gates:read.',
            annotations: { readOnlyHint: true },
        },
        (extra) => tool(extra.requestInfo?.headers, (c) => c.request('GET', '/flow/transitions')),
    );

    server.registerTool(
        'flow_get_project_phase',
        {
            title: 'Get project phase',
            description: 'Returns the project\'s current phase, next phase, risk class and the status of every gate (GET /flow/projects/{id}/phase). Needs flow:gates:read.',
            inputSchema: { project_id: z.number().int().positive() },
            annotations: { readOnlyHint: true },
        },
        ({ project_id }, extra) => tool(extra.requestInfo?.headers, (c) => c.request('GET', `/flow/projects/${project_id}/phase`)),
    );

    server.registerResource(
        'flow-job',
        new ResourceTemplate('flow://jobs/{id}', { list: undefined }),
        { title: 'Flow job', description: 'A development job with input, output, metrics and gate approvals (GET /flow/jobs/{id}).', mimeType: 'application/json' },
        (uri, { id }, extra) => resource(uri, extra.requestInfo?.headers, (c) => c.request('GET', `/flow/jobs/${encodeURIComponent(String(id))}`)),
    );

    server.registerResource(
        'flow-phases',
        'flow://phases',
        { title: 'Flow configuration', description: 'Phases with gates, risk classes and job types (GET /flow/phases).', mimeType: 'application/json' },
        (uri, extra) => resource(uri, extra.requestInfo?.headers, (c) => c.request('GET', '/flow/phases')),
    );

    return server;
}
