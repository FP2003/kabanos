# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-06-23

### Added

- Comment scanner for TypeScript/JavaScript/JSX/TSX, Python, Go, Rust, CSS/SCSS, and HTML with `.gitignore` support, project-root containment, file-size limits, incremental mtime/size caching, and a pluggable custom parser API.
- Board reconciliation lifecycle: create cards from new comments, update moved or changed comments, archive removed comments, resolve cards without touching source files, and suppress resolved fingerprints on future scans.
- SQL persistence layer via Kysely with SQLite (default), PostgreSQL, and MySQL adapters. Schema migrations run automatically and are versioned — safe to upgrade without manual intervention.
- Fetch-compatible core API with auth guard enforcement, actor resolution, JSON/origin mutation checks, source-context endpoint, settings and column management endpoints, and manual scan trigger.
- Framework adapters: Express, Fastify, Next.js route handler, and generic Node `http`.
- React kanban UI with light/dark Notion-derived theme tokens, drag-and-drop, keyboard column movement, card details panel, notes, assignee, labels, source context viewer, scan trigger, settings panel, column management, and scan path overrides.
- `kabanos init` CLI that generates `kanban.config.ts` and prints a framework-specific mounting snippet without modifying host application source files.
- Runnable demo (`pnpm demo`) with multi-language sample project (TypeScript, Python, Go, CSS, HTML).

### Fixed

- Card position accounting in multi-column reconcile runs: positions are now tracked per-column so newly created cards in one column no longer inflate position indices for cards created in other columns in the same scan.
