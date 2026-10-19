# TALVIS flow MCP server

A thin [Model Context Protocol](https://modelcontextprotocol.io) layer over the TALVIS flow
orchestrator API. It lets an AI agent pick up development jobs, ask humans for gate decisions and
report results. Every tool calls exactly one REST endpoint and forwards the machine token; there
is no business logic and no database access here.

There is deliberately **no tool to approve or reject anything**. Machines can ask for a decision,
only people can make it — the same boundary the machine tokens enforce in TALVIS.

## Build

```bash
cd mcp
npm ci
npm run build
```

Requires Node.js 20 or newer.

## Configuration

| Variable | Meaning |
|---|---|
| `TALVIS_URL` | API base URL including `/api`, e.g. `https://talvis.example.com/backend/api` |
| `TALVIS_MACHINE_TOKEN` | Machine token from `php artisan flow:token:issue …` |
| `PORT`, `HOST` | HTTP mode only; default `3333` on `127.0.0.1` |

Issue a token on the TALVIS server:

```bash
php artisan flow:token:issue orchestrator --ability=flow:jobs:read --ability=flow:jobs:write --ability=flow:gates:read --expires-days=90
```

## Transports

**stdio** (default) — the client starts the server as a subprocess; the token comes from
`TALVIS_MACHINE_TOKEN`.

**Streamable HTTP** — `node dist/index.js --http`, endpoint `http://HOST:PORT/mcp`, stateless.
The token is taken from the client's `Authorization: Bearer <token>` header and passed on to
TALVIS unchanged. `TALVIS_MACHINE_TOKEN` is used as a fallback **only** when `HOST` is a loopback
address, so an exposed HTTP server never lends its own token to anonymous callers.

## Tools

| Tool | REST call | Ability |
|---|---|---|
| `flow_list_open_jobs` | `GET /flow/jobs?state=open` | `flow:jobs:read` |
| `flow_list_my_jobs` | `GET /flow/jobs?state=…` (claimed/running default to the calling machine) | `flow:jobs:read` |
| `flow_claim_job` | `POST /flow/jobs/{id}/claim` | `flow:jobs:write` |
| `flow_request_gate` | `POST /flow/jobs/{id}/gate-request` | `flow:jobs:write` |
| `flow_get_gate_decision` | `GET /flow/jobs/{id}/gates` | `flow:gates:read` |
| `flow_report_result` | `POST /flow/jobs/{id}/result` | `flow:jobs:write` |
| `flow_fail_job` | `POST /flow/jobs/{id}/fail` | `flow:jobs:write` |
| `flow_list_transitions` | `GET /flow/transitions` | `flow:gates:read` |
| `flow_get_project_phase` | `GET /flow/projects/{id}/phase` | `flow:gates:read` |

## Resources

| URI | REST call |
|---|---|
| `flow://jobs/{id}` | `GET /flow/jobs/{id}` |
| `flow://phases` | `GET /flow/phases` |

## Client configuration

### Claude Code

stdio, registered for the current project:

```bash
claude mcp add talvis-flow \
  --env TALVIS_URL=https://talvis.example.com/backend/api \
  --env TALVIS_MACHINE_TOKEN=<token> \
  -- node /path/to/backend/mcp/dist/index.js
```

or as `.mcp.json` in the repository the agent works in:

```json
{
    "mcpServers": {
        "talvis-flow": {
            "command": "node",
            "args": ["/path/to/backend/mcp/dist/index.js"],
            "env": {
                "TALVIS_URL": "https://talvis.example.com/backend/api",
                "TALVIS_MACHINE_TOKEN": "${TALVIS_MACHINE_TOKEN}"
            }
        }
    }
}
```

HTTP, against a running `--http` server:

```bash
claude mcp add --transport http talvis-flow http://127.0.0.1:3333/mcp --header "Authorization: Bearer <token>"
```

### Any MCP client

- **stdio:** command `node`, argument `<path>/mcp/dist/index.js`, environment `TALVIS_URL` and
  `TALVIS_MACHINE_TOKEN`.
- **Streamable HTTP:** URL `http://<host>:<port>/mcp`, header `Authorization: Bearer <token>`.

## Smoke test

Runs the job lifecycle once through the MCP server (stdio) against a running TALVIS instance:
two jobs are created with a user token, one goes claim → gate request → human approval → result
(`in_review`) → human requests changes → result again (next review round), the other
claim → fail; transitions, project phase and both resources are read.

Prerequisites on the TALVIS side: migrations, `FlowAt2Seeder` (or an equivalent configuration),
a project in a phase that has the gate `SMOKE_GATE_KEY`, a machine token with all three abilities,
and a user token whose user has `project_manager` plus the gate's role.

```bash
npm run build
TALVIS_URL=http://127.0.0.1:8000/api \
TALVIS_MACHINE_TOKEN=<machine token> \
TALVIS_USER_TOKEN=<user token> \
SMOKE_PROJECT_ID=<project id> \
npm run smoke
```

Optional: `SMOKE_JOB_TYPE` (default `care_fix`), `SMOKE_GATE_KEY` (default `release`),
`SMOKE_JOB_INPUT` (JSON, default fits `care_fix`). The test writes real jobs and approvals —
run it against a development or throwaway database, not production.
