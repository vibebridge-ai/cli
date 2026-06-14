# Starter site

A tiny one-page demo for a fictional coffee bar. It shows how to author HTML that
VibeBridge can publish and that the owner can edit later. Copy it, change the copy,
swap the image, and deploy.

## What it demonstrates

- `data-cms-key` on every meaningful heading and paragraph, using semantic dotted
  keys (`hero.headline`, `menu.item1.name`). Semantic keys survive re-uploads, so
  the owner's edits always re-attach to the right element.
- One `data-cms-section` per section (`hero`, `menu`, `visit`, `footer`), which
  groups the editable slots in the owner's sidebar.
- An image slot: `<img data-cms-key="hero.image" data-cms-type="image" src="assets/hero.svg">`.
- A CTA link: `<a data-cms-button="hero.cta">`, so the owner can edit its label and URL.
- A contact `<form>` with a relative `action`, so submissions reach the owner's
  VibeBridge inbox as leads. An external action would bypass VibeBridge and the
  lead would be lost.

## The hero image

`index.html` references `assets/hero.svg` with a relative path. A placeholder
image ships in `assets/` so this example deploys cleanly. To use your own photo,
drop it next to `index.html` (for example `assets/hero.jpg`) and update the
`src` in `index.html`. The CLI collects local images and uploads them, so the
path resolves on the live site. A missing file will 404.

## Run it

1. Sign up and create a site at https://app.vibebridge.ai/signup
2. Generate an API key in the portal under your site, Integrations. It starts with `vbb_live_`.
3. Export the key:

   ```sh
   export VIBEBRIDGE_API_KEY="vbb_live_..."
   ```

4. Edit `vibebridge.json` and replace `"your-site-slug"` with your real site slug
   (the slug shown in the portal). JSON has no comments, so this placeholder lives
   only in the file. You can also drop the `site` field entirely if your account
   has just one site, and the CLI will resolve it for you.

5. From this folder, check then deploy:

   ```sh
   npx vibebridge check
   npx vibebridge deploy
   ```

`deploy` uploads the page, ships the local image, publishes the draft, and prints
the live URL. Re-running it later keeps the owner's edits in place, so it is safe
to iterate.

## Learn the conventions

See [../../skill/reference/conventions.md](../../skill/reference/conventions.md)
for the full editable-HTML contract.
