# Releasing

Maintainer notes for publishing the VibeBridge CLI. Two buttons stay manual: `npm publish` and
`git push`.

## 0. Smoke test first

```sh
npm test                                   # runs --version and --help
cd examples/starter-site
VIBEBRIDGE_API_KEY="vbb_live_..." node ../../bin/vibebridge.mjs whoami
VIBEBRIDGE_API_KEY="vbb_live_..." node ../../bin/vibebridge.mjs deploy
```

Confirm the live URL works before going public. This is the only step that needs a real key.

## 1. npm (package name: `vibebridge`, unscoped)

```sh
npm login                  # account with 2FA
npm publish                # publishes vibebridge@<version> as public
```

Bump `version` in package.json for every release. The package ships only `bin/`, `README.md`, and
`LICENSE` (see the `files` field). After publishing, `npx vibebridge` works for everyone.

## 2. GitHub (org `vibebridge-ai`, repo `cli`)

Create the org `vibebridge-ai` and an empty repo `cli`, then:

```sh
git remote add origin https://github.com/vibebridge-ai/cli.git
git push -u origin main
```

Set the repo to public. The `repository` and `bugs` URLs in package.json already point here.

## 3. After release

- Tag the release: `git tag v0.1.0 && git push --tags`.
- Link the repo from the website and from the Claude landing page.
- Consider submitting `skill/` to a skill or plugin marketplace for extra reach.
