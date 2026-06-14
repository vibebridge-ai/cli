# Publishing to VibeBridge

Two ways to publish a finished site. Path A is the CLI, recommended for almost everyone. Path B
is the raw MCP JSON-RPC sequence, useful when VibeBridge is already connected as an MCP server
in your agent or when you want full control.

Both need a customer API key that starts with `vbb_live_`. Generate it in the portal under your
site, then Integrations. Export it:

```bash
export VIBEBRIDGE_API_KEY="vbb_live_..."
```

The default endpoint is `https://app.vibebridge.ai`. The MCP URL is
`https://app.vibebridge.ai/api/mcp`.

## Path A: the CLI (recommended)

From your finished site folder:

```bash
npx vibebridge init      # scaffold a vibebridge.json from the *.html in this folder
npx vibebridge check     # local lint, plus server validation if a key is set
npx vibebridge deploy    # upload every page, then publish the site live
```

`init` detects your HTML files and prefills the page list. `index.html` becomes the home page at
`/`. `check` flags forms that would lose leads and images that would 404. `deploy` uploads each
page as a draft and then promotes the site to live, printing the live URL at the end.

Useful flags:

- `vbb deploy --site <slug>` pick the target site when the key has more than one.
- `vbb deploy --dry-run` show the plan and the detected image assets without any network call.
- `vbb deploy --no-publish` upload pages but skip the publish step.
- `vbb deploy --check` run a readiness preflight before each upload.
- `vbb push <file> --path /about --publish` upload a single page and publish in one go.

Example `vibebridge.json`:

```json
{
  "site": "my-cafe",
  "endpoint": "https://app.vibebridge.ai",
  "pages": [
    { "file": "index.html", "slug": "home", "label": "Home", "path": "/", "sortOrder": 0 },
    { "file": "about.html", "slug": "about", "label": "About", "path": "/about", "sortOrder": 1 }
  ]
}
```

`endpoint` is optional and defaults to production. `site` is optional, since the CLI can
auto-resolve when the key has exactly one site. Each page needs `file`, `slug`, `label`, and
`path`. `sortOrder` is optional.

## Path B: raw MCP JSON-RPC

Every call POSTs to `https://app.vibebridge.ai/api/mcp` with a `Bearer` key and a JSON-RPC
envelope. The sequence:

1. `site_list` resolves which sites the key can reach. Customer keys see only their own sites.
   Note: `site_create` is admin-only and not available to customer keys.
2. `page_upload` with `{ site, pageSlug, pageLabel, pagePath, sortOrder?, html, assets? }`
   uploads one page as a draft. `site` is a slug or uuid. `assets` is
   `[{ path, contentBase64 }]` for any relative images. HTML is capped at 4 MB.
3. Repeat `page_upload` for each page.
4. `site_publish` with `{ site }` promotes the drafts and deploys the site live. The result
   includes `deploy.liveUrl`. If it is missing, call `deploy_status` with `{ site }` to read the
   live URL.

Optional read-only helpers before you upload: `page_preflight` and `validate_html` both check
HTML at zero cost and need no site. `get_conventions` returns the annotation guide.

The JSON-RPC request envelope:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "site_list", "arguments": {} } }
```

A curl example, listing sites:

```bash
curl -sS https://app.vibebridge.ai/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VIBEBRIDGE_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"site_list","arguments":{}}}'
```

Uploading a page (HTML and base64 trimmed for readability):

```bash
curl -sS https://app.vibebridge.ai/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VIBEBRIDGE_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "page_upload",
      "arguments": {
        "site": "my-cafe",
        "pageSlug": "home",
        "pageLabel": "Home",
        "pagePath": "/",
        "sortOrder": 0,
        "html": "<!doctype html> ...",
        "assets": [{ "path": "hero.jpg", "contentBase64": "..." }]
      }
    }
  }'
```

Then publish:

```bash
curl -sS https://app.vibebridge.ai/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VIBEBRIDGE_API_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"site_publish","arguments":{"site":"my-cafe"}}}'
```

### Reading the response

Each tool returns a `result`. The data you want is in `result.structuredContent`, or in
`result.content[0].text` as a JSON string. If `result.isError` is true, the tool failed and the
message is in `result.content[0].text`. A top-level `error` is a protocol error. Code `-32001`
means the key is missing, wrong, or revoked.

A connectivity check needs no key. A plain `GET https://app.vibebridge.ai/api/mcp` returns the
server name, version, and tool count.

## Troubleshooting

- 401 or error code -32001: the API key is missing, wrong, or revoked. Re-export
  `VIBEBRIDGE_API_KEY` with a fresh `vbb_live_` key from Portal, then your site, then
  Integrations.
- No site found: the key has no accessible site. Create one at
  https://app.vibebridge.ai/signup. Customer keys cannot create sites.
- More than one site: pass `--site <slug>` to the CLI, or set `site` in `vibebridge.json`. Via
  MCP, pass the right slug to `page_upload` and `site_publish`.
- Images 404 on the live site: relative image files were not shipped. Let the CLI collect them,
  or pass them in the `page_upload` `assets` array, or use absolute `https://` URLs.
- Form not capturing leads: the form `action` points off-site. Use a relative or empty action,
  or mark a JS-rendered form with `data-vbb-form="<slug>"`. See conventions.md.
- Rate limited: the API allows 120 requests per minute per key. Slow down and retry.
