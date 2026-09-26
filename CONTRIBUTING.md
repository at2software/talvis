# Contributing to TALVIS

Thanks for your interest in TALVIS. This document explains what we accept,
what we don't, and what you need to do when you open a pull request.

## How this project is governed

TALVIS is developed and maintained by at² GmbH. It runs our own company and has
done so for over 25 years. We release it under the AGPL-3.0-or-later because we
want as many people as possible to use it — not because we are building a
community-run project.

That means the roadmap and the architecture of the core stay with at². We are
glad to receive contributions, but we decide what goes in. A pull request is an
offer, not an obligation, and we may decline one without it being a judgement on
your work.

We think it is fairer to say this up front than to let you write a large feature
and then reject it.

## What we welcome

- **Bug reports.** Open an issue with steps to reproduce, your version, and what
  you expected instead.
- **Bug fixes.** Open a pull request directly. Small, focused changes are
  easiest for us to review.
- **Documentation.** Corrections, clarifications, missing setup steps.
- **Translations.**
- **Small improvements.** Anything that touches a handful of files and doesn't
  change how the system is structured.

## Large features

Large features — a new module, a new integration, anything that changes the data
model or adds a dependency — rarely make it into the core. TALVIS has no plugin
system for third-party code; if a feature does not fit the core, it can usually
be built as a separate application against the TALVIS REST API, or maintained in
your own fork.

Two reasons. First, the core has to stay maintainable by a small team; every
feature in it is a feature we support forever. Second, a separate application or
fork stays yours: you keep control over it, release on your own schedule, and
don't have to wait for us.

**Before you write anything substantial, open an issue and ask.** We will tell
you honestly whether we would merge it, whether it should live outside the core,
or whether we plan to build it ourselves. This costs you one message and can
save you a weekend.

## Signing off your commits

Every commit must carry a `Signed-off-by` line. By adding it you certify the
[Developer Certificate of Origin](DCO) — in short, that you have the right to
contribute the code you are submitting.

This matters in practice: if you write code during working hours, the rights may
belong to your employer rather than to you. The sign-off is you confirming that
this is not the case, or that you have permission.

Add it automatically with:

```
git commit -s -m "your message"
```

which appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and a working email address. Pseudonyms are not accepted.

If you forgot to sign off, fix the last commit with:

```
git commit --amend -s --no-edit
git push --force-with-lease
```

For several commits, use `git rebase --signoff` over the range.

Note that the DCO is **not** a copyright assignment. You keep the rights to your
contribution. We are not asking you to hand anything over.

## Licence

Contributions are accepted under the AGPL-3.0-or-later, the same licence the
project uses. By submitting a pull request you agree that your contribution is
licensed under those terms.

## Before you open a pull request

- One topic per pull request. Unrelated changes in one pull request are hard to
  review and hard to revert.
- Match the surrounding code style. We would rather have a consistent codebase
  than a perfect one.
- Describe what changes and why. "Fixes the invoice rounding error reported in
  #123" is enough; we don't need an essay.
- If your change affects behaviour users will notice, say so — we need it for the
  changelog.

## Security issues

Please do **not** open a public issue for security problems. Write to
[security@at2-software.com](mailto:security@at2-software.com) instead, and give
us a reasonable window to fix it before disclosure.

## Questions

Open an issue with the `question` label, or reach us at
[info@at2-software.com](mailto:info@at2-software.com). We usually answer within
a few working days.
