# Tool discovery: Better Auth, Nodemailer, MongoDB/Mongoose
Date: 2026-11-11

Installed project skills (`skills list`): none.

## 1. Better Auth
- better-auth/skills@better-auth-best-practices (official, 131.6K installs). Server/client config, adapters, sessions, plugins.
- better-auth/skills@create-auth (official). Scaffolds auth into a Next.js/TS app: adapters, route handlers, OAuth, UI.
- better-auth/skills@better-auth-security-best-practices (official). Rate limiting, secrets, CSRF, trusted origins, cookies.
- better-auth/skills@email-and-password-best-practices (official). Email/password flows.
- better-auth/skills@two-factor-authentication-best-practices (official). 2FA plugin.
- MCP: official docs server at https://mcp.better-auth.com/mcp (added via `npx auth@latest mcp`). Docs search only.
- MCP (community, unverified): nahmanmate/better-auth-mcp-server and LexiconAlex/better-auth-mcp-server. Needs env credentials; not verified.

## 2. Nodemailer
- No official Nodemailer skill found.
- aidotnet/moyucode@nodemailer (community, 100 installs). Nodemailer usage.
- aidotnet/moyucode@email-sender (community, 59 installs). Generic email sending.
- MCP (community, unverified): u1pns/sendmail-mcp (single send_email tool via Nodemailer); adibfairuz/nodemailer-mcp (Gmail sender); ni-c/smtp-mcp (recipient allowlist plus human confirmation before send).

## 3. MongoDB / Mongoose
- MCP (official): mongodb-js/mongodb-mcp-server (npm `mongodb-mcp-server`, Docker `mongodb/mongodb-mcp-server`). Needs Node 20.19+ or 22.12+. Supports read-only mode.
- mongodb/agent-skills (official, MongoDB): mongodb-connection (pool and client config), mongodb-mcp-setup, mongodb-natural-language-querying, mongodb-query-optimizer, mongodb-search-and-ai, mongodb-atlas-stream-processing, mongodb-qe-size-estimation.
- prisma/skills@prisma-mongodb-upgrade (official Prisma, 400.3K installs). Only relevant if moving off Mongoose to Prisma.
- Mongoose (community, unverified):
  - pluginagentmarketplace/custom-plugin-nodejs@mongoose-mongodb (699 installs)
  - practicalswan/agent-skills@mongodb-mongoose (52 installs)
  - agents-inc/skills@api-database-mongoose (33 installs)
  - nicklaunches/claude-skills mongoose skill (install via add-skill, not verified with skills CLI)
- No official Mongoose skill or MCP found.

## Notes
- `skills list` found no project skills. The first run timed out; a retry with a longer timeout succeeded.
- `skills add --list` run for better-auth/skills (6 skills) and mongodb/agent-skills (8 skills). Nothing was installed.
