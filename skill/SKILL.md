---
name: vibebridge
description: Publish and update a finished, AI-built website on VibeBridge so it is live on a custom domain and editable by the owner. Use when the user wants to get their HTML site online, make it editable, deploy to VibeBridge, set up content slots, or capture leads from forms. VibeBridge is a post-build layer, not a website builder.
---

# VibeBridge

Get a finished, AI-built website online and editable on VibeBridge. Use this when the user
has HTML they built (with Claude Code, Cursor, Codex, Gemini CLI, Copilot, Windsurf, or by
hand) and now wants it live, editable, and capturing leads.

## 1. What VibeBridge is

VibeBridge is the post-build layer for websites. The user brings a finished site. VibeBridge
handles hosting on a custom domain, makes every text and image editable by the owner without
code, captures form submissions as leads, and reports analytics.

It is NOT a website builder. Do not try to generate a site inside VibeBridge. Build the site
first, then bring it here.

## 2. First-time setup

Route a new user through this once:

1. Sign up at https://app.vibebridge.ai/signup and create a site in the portal.
2. Generate an API key: Portal, then your site, then Integrations. The key starts with
   `vbb_live_`.
3. Export it so the CLI and MCP can use it:

   ```bash
   export VIBEBRIDGE_API_KEY="vbb_live_..."
   ```

Keep the key out of committed files. Treat it like a password.

## 3. Author HTML so the owner can edit it

Annotation is optional. Unannotated HTML still goes live, but annotated HTML is editable and
re-uploads stay stable. See `reference/conventions.md` for the full contract. The essentials:

- Mark editable text with a semantic `data-cms-key`, for example
  `<h1 data-cms-key="hero.headline">Welcome</h1>`.
- Group slots for the editor sidebar with `data-cms-section`, for example
  `<section data-cms-section="hero"> ... </section>`.
- Mark images with `data-cms-key` plus `data-cms-type="image"`.
- Make a link's URL editable with `data-cms-button`, for example
  `<a data-cms-button="hero.cta" href="/contact">Book now</a>`.
- Give forms a relative or empty `action` so submissions are captured as leads. An external
  action loses the leads.

Prefer meaningful keys like `hero.headline` over letting auto keys generate. Semantic keys are
stable forever, so a re-upload re-attaches every owner edit perfectly even if the layout
changed.

## 4. Validate, then publish

See `reference/publishing.md` for full detail. The fast path uses the CLI:

```bash
npx vibebridge check     # local lint, plus server validation if a key is set
npx vibebridge deploy    # uploads pages and publishes the site live
```

Run `check` first and fix any flagged forms or missing images. Then `deploy` uploads each page
and promotes the site to live, printing the live URL.

Alternative: if VibeBridge is already connected as an MCP server in the agent, call the tools
directly (`page_upload` then `site_publish`). `reference/publishing.md` has the exact sequence.

## 5. Safety

- Confirm the target site slug with the user before publishing. Never invent a slug.
- If the key has access to more than one site, ask which one. If it has exactly one site, name
  it before you publish.
- Re-uploading the same HTML is safe. VibeBridge matches content and preserves the owner's
  edits, so you can iterate without losing changes.
- Never call admin-only operations. Customer keys cannot create sites. If the user has no site,
  send them to https://app.vibebridge.ai/signup to create one.
