# erics-personal-tools

Eric Berry's personal tools: a Chrome sidebar, a mobile web app, and the API that
backs them both.

## What's here

| Folder | What it is |
| --- | --- |
| [`chrome-sidebar/`](./chrome-sidebar) | Chrome side panel extension — travel wallet, best-card advice, rewards, restaurant reservations, ESPN draft board, and Gmail assistance. Canonical home of the shared UI components and data adapters. |
| [`mobile-app/`](./mobile-app) | Installable iPhone web app for the same tools, unlocked by passkey and usable offline. Built from the sidebar's shared modules. |
| [`tools-api/`](./tools-api) | Cloudflare Worker and D1 database — encrypted record storage, AI provider routing, release metadata. Also serves the mobile app. |
| [`docs/`](./docs) | Design system, UI component catalogue, visual QA process, and the Cloudflare runbook. |

Agents working in this repository start at [AGENTS.md](./AGENTS.md).

## Setup on a new Mac

```sh
git clone git@github.com:ericzberry/erics-personal-tools.git ~/erics-personal-tools
```

Then follow the README in each subfolder for that tool's install, build, and
deployment steps.

## Everyday commands

Run these from the repository root.

```sh
npm --prefix chrome-sidebar test && npm --prefix mobile-app test && npm --prefix tools-api test
```

```sh
npm --prefix chrome-sidebar run build && npm --prefix mobile-app run build
```
