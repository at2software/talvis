import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { TalvisClient } from './talvis-client.js';

const env = (name: string, fallback?: string): string => {
    const value = process.env[name] ?? fallback;
    if (!value) {
        console.error(`${name} is not set.`);
        process.exit(1);
    }
    return value;
};

const baseUrl = env('TALVIS_URL');
const machineToken = env('TALVIS_MACHINE_TOKEN');
const team = new TalvisClient(baseUrl, env('TALVIS_USER_TOKEN'));
const projectId = Number(env('SMOKE_PROJECT_ID'));
const jobType = env('SMOKE_JOB_TYPE', 'care_fix');
const gateKey = env('SMOKE_GATE_KEY', 'release');
const input = JSON.parse(env('SMOKE_JOB_INPUT', JSON.stringify({ issue: 'https://git.example.com/acme/shop/-/issues/1', repo: 'https://git.example.com/acme/shop.git', base_ref: 'master' })));

let step = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
    step++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}. ${label}`);
    if (!ok) {
        console.error(detail);
        process.exit(1);
    }
};

const client = new Client({ name: 'talvis-flow-smoke', version: '0.1.0' });
await client.connect(
    new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('./index.js', import.meta.url))],
        env: { ...process.env, TALVIS_URL: baseUrl, TALVIS_MACHINE_TOKEN: machineToken } as Record<string, string>,
    }),
);

const call = async <T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    if (result.isError) {
        check(`${name} succeeds`, false, text);
    }
    return JSON.parse(text) as T;
};

const tools = (await client.listTools()).tools.map((_) => _.name);
check('server exposes the nine flow tools and no approval tool', tools.length === 9 && !tools.some((_) => /approve|decide/.test(_)), tools);

const created = [];
for (let i = 0; i < 2; i++) {
    created.push(await team.request<{ id: number }>('POST', `/flow/projects/${projectId}/jobs`, { type: jobType, input }));
}
const [jobA, jobB] = created.map((_) => _.id);

const open = await call<{ id: number }[]>('flow_list_open_jobs', { type: jobType });
check('both new jobs are listed as open', [jobA, jobB].every((id) => open.some((_) => _.id === id)), open);

const claimed = await call<{ state: string; claimed_by: string }>('flow_claim_job', { job_id: jobA });
check('job A is claimed', claimed.state === 'claimed', claimed);

const mine = await call<{ id: number }[]>('flow_list_my_jobs', { state: 'claimed' });
check('job A is listed among my claimed jobs', mine.some((_) => _.id === jobA), mine);

const second = await client.callTool({ name: 'flow_claim_job', arguments: { job_id: jobA } });
check('claiming job A again fails', second.isError === true, second);

const gate = await call<{ job: { state: string }; approval: { id: number; decision: string } }>('flow_request_gate', { job_id: jobA, gate_key: gateKey, options: ['ship', 'hold'], recommendation: 'ship', source: 'agent', diff_url: 'https://git.example.com/acme/shop/-/compare/master...smoke' });
check('gate request puts job A into awaiting_gate', gate.job.state === 'awaiting_gate' && gate.approval.decision === 'pending', gate);

const pending = await call<{ decision: string }[]>('flow_get_gate_decision', { job_id: jobA });
check('gate decision is pending', pending[0]?.decision === 'pending', pending);

await team.request('POST', `/flow/approvals/${gate.approval.id}/approve`, { reason: 'smoke test', selected_option: 'ship' });
const decided = await call<{ decision: string; selected_option: string }[]>('flow_get_gate_decision', { job_id: jobA });
check('a person approved the gate with option "ship"', decided[0]?.decision === 'approved' && decided[0]?.selected_option === 'ship', decided);

type Result = { job: { state: string; metrics: Record<string, number> }; review_approvals: { id: number }[] };
const report = () =>
    call<Result>('flow_report_result', {
        job_id: jobA,
        mr_url: 'https://git.example.com/acme/shop/-/merge_requests/1',
        test_report: 'smoke: 1 passed',
        metrics: { duration_minutes: 1 },
        knowledge: { general: { note: 'smoke test' } },
    });
const result = await report();
check('result puts job A into in_review with review approvals', result.job.state === 'in_review' && result.review_approvals.length > 0 && result.job.metrics.duration_minutes === 1, result);

await team.request('POST', `/flow/approvals/${result.review_approvals[0].id}/request-changes`, { reason: 'smoke: please rework' });
const reworked = await call<{ decision: string; reason: string; review_round: number | null }[]>('flow_get_gate_decision', { job_id: jobA });
const review = reworked.find((_) => _.review_round === 1);
check('a person requested changes on the review, the reason is readable', review?.decision === 'changes_requested' && review.reason === 'smoke: please rework', reworked);

const again = await report();
check('a second result opens the next review round', again.job.state === 'in_review' && again.review_approvals.length > 0, again);

await call('flow_claim_job', { job_id: jobB });
const failed = await call<{ state: string }>('flow_fail_job', { job_id: jobB, reason: 'smoke test failure path' });
check('job B is claimed and failed', failed.state === 'failed', failed);

const transitions = await call<unknown[]>('flow_list_transitions');
check('transitions are readable', Array.isArray(transitions) && transitions.length > 0, transitions);

const phase = await call<{ project_id: number; gates: unknown[] }>('flow_get_project_phase', { project_id: projectId });
check('project phase is readable', phase.project_id === projectId && Array.isArray(phase.gates), phase);

const jobResource = await client.readResource({ uri: `flow://jobs/${jobA}` });
const job = JSON.parse((jobResource.contents[0] as { text: string }).text);
check('resource flow://jobs/{id} returns job A with its approvals', job.id === jobA && job.state === 'in_review' && job.approvals.length >= 3, job);

const phasesResource = await client.readResource({ uri: 'flow://phases' });
const config = JSON.parse((phasesResource.contents[0] as { text: string }).text);
check('resource flow://phases returns the configuration', Array.isArray(config.phases) && Array.isArray(config.job_types) && Array.isArray(config.job_states?.in_review), config);

await client.close();
console.log(`smoke test passed (${step} checks)`);
