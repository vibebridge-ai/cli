# VibeBridge CLI

**Your website is built with AI. VibeBridge handles the rest.**

Get your AI website online and editable in minutes.

[![npm version](https://img.shields.io/npm/v/vibebridge-cli.svg)](https://www.npmjs.com/package/vibebridge-cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## What is this

The official VibeBridge CLI. Push a finished, AI-built HTML site live on VibeBridge and make every text and image editable by the owner. It works with any static HTML site, whatever tool produced it (Claude Code, ChatGPT, Cursor, Gemini CLI, Copilot, Windsurf).

VibeBridge is the post-build layer. It handles hosting, content editing, forms and leads, and analytics. It is not a website builder.

## Quickstart

```bash
# 1. Sign up and create a site at https://app.vibebridge.ai/signup
# 2. Generate an API key in the portal (Integrations), it starts with vbb_live_
export VIBEBRIDGE_API_KEY="vbb_live_..."

# 3. From your finished site folder:
npx vibebridge-cli init
npx vibebridge-cli deploy
```

`init` scaffolds a `vibebridge.json` from the HTML files in the folder. `deploy` uploads every page, then publishes the site live and prints the live URL.

## Commands

Run any command with `vibebridge` or the short alias `vbb`.

| Command | What it does | Key flags |
| --- | --- | --- |
| `vbb whoami` | Check connectivity and show the sites your key can reach. | `--key`, `--endpoint` |
| `vbb init` | Scaffold a `vibebridge.json` from the HTML files in the current folder. | (none) |
| `vbb check [file]` | Lint your HTML locally for common publish problems, no key required. With a key it also runs server validation. | `--key`, `--endpoint` |
| `vbb deploy` | Read `vibebridge.json`, upload every page, then publish the site live. Alias `vbb publish`. | `--site`, `--page`, `--dry-run`, `--no-publish`, `--check`, `--key`, `--endpoint`, `--config` |
| `vbb push <file>` | Upload one HTML file as a single page. | `--site`, `--path`, `--slug`, `--label`, `--sort`, `--publish`, `--dry-run`, `--check`, `--key`, `--endpoint` |

Need a key? Sign up at https://app.vibebridge.ai/signup, create a site, then open Portal, your site, Integrations to generate one. It starts with `vbb_live_`.

## Make your site editable

VibeBridge turns plain HTML into an editable site by reading lightweight attributes such as `data-cms-key` on text, `data-cms-section` for grouping, and image slots. Meaningful keys like `hero.headline` survive re-uploads better than auto-generated ones, so your owner keeps their edits as you iterate.

Read the full editable-HTML contract in [skill/reference/conventions.md](./skill/reference/conventions.md).

## Use it from your AI coding tool

This repo ships a Claude skill in [`skill/`](./skill) that teaches an AI agent how to get a finished site online and editable on VibeBridge. Install it into your agent and ask it to publish.

VibeBridge also speaks MCP at `https://app.vibebridge.ai/api/mcp`. When VibeBridge is connected as an MCP server in your agent, it can publish without the CLI using these tools:

- `mcp_whoami` and `site_list` to see the sites your key can reach.
- `page_preflight` and `validate_html` to check a page before upload.
- `page_upload` to add or update a page.
- `site_publish` to promote drafts and go live.
- `deploy_status` to read the live URL and last deploy.

Authenticate with your `vbb_live_` key as a Bearer token. Customer keys are scoped to your own sites and rate limited.

## Config reference

`vibebridge.json` lives in your site folder and describes which files become which pages.

```json
{
  "site": "my-site-slug",
  "endpoint": "https://app.vibebridge.ai",
  "pages": [
    { "file": "index.html", "slug": "home", "label": "Home", "path": "/", "sortOrder": 0 }
  ]
}
```

- `site` is optional. If you have a single site, the CLI resolves it for you. With more than one, set it here or pass `--site <slug>`.
- `endpoint` is optional and defaults to `https://app.vibebridge.ai`.
- Each page needs `file`, `slug`, `label`, and `path`. `sortOrder` is optional.

## Links

- Website: https://vibebridge.ai
- Sign up: https://app.vibebridge.ai/signup

## License

MIT. See [LICENSE](./LICENSE).

Built by Kompass Consulting GmbH.
