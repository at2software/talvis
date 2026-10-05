# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue, pull request or discussion for security
problems. Write to [security@at2-software.com](mailto:security@at2-software.com)
instead.

A useful report contains:

- the TALVIS version (see `VERSION`) or the commit you looked at,
- the affected endpoint, component or file,
- what an attacker needs beforehand — anonymous, any logged-in user, a specific
  role,
- steps to reproduce or a proof of concept, and what happens versus what should
  happen,
- whether you verified it against a running instance or by reading the source.

You can write in English or German.

## Supported versions

TALVIS is maintained by a small team. Security fixes go into the next release
only; we do not backport them to older versions. Please upgrade to the latest
release before reporting, and check whether the issue still exists there.

| Version            | Supported |
| ------------------ | --------- |
| latest release     | yes       |
| everything older   | no        |

## What happens after you report

- We confirm that we received your report within **5 working days**.
- We check the report against the current code and tell you whether we can
  reproduce it. If we cannot, we explain why.
- Confirmed issues are fixed in our codebase and published with the next TALVIS
  release. We aim to release a fix within **90 days** of the report, sooner for
  severe issues.
- We tell you when the release with the fix is published.

Please keep the details to yourself until that release is out. If the 90 days
pass without a fix and without an agreement between us, you are free to
disclose.

## Credit

We name reporters of confirmed issues in the changelog of the release that
fixes them, under the name or handle you choose — or not at all, if you prefer.
Tell us your preference when you report.

We do not run a bug bounty programme and do not pay for reports.

## Testing rules

Test against your own installation. TALVIS ships with a Docker setup (see
`README.md`), so you can run a complete instance locally.

Do **not** test against any instance you do not run yourself, unless its
operator has given you permission. That includes automated scanning, attempts to access other people's
data, and anything that degrades availability.

## Scope

In scope: the TALVIS source code in this repository — backend, frontend and the
shipped Docker configuration.

Out of scope:

- vulnerabilities in third-party dependencies that are already publicly known
  and only need a version bump — a regular issue or pull request is fine for
  those,
- weaknesses that require an already compromised server or administrator
  account,
- the configuration of individual installations, such as TLS, mail or the
  reverse proxy, unless the shipped defaults are the problem,
- missing security headers or other best-practice findings without a
  demonstrated impact.
