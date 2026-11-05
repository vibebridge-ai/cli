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

## 1. npm (package name: `vibebridge-cli`, unscoped)

```sh
npm login                  # account with 2FA
npm publish                # publishes vibebridge-cli@<version> as public
```

Bump `version` in package.json for every release. The package ships only `bin/`, `README.md`, and
`LICENSE` (see the `files` field). After publishing, `npx vibebridge-cli` works for everyone. The
unscoped name `vibebridge` is held by a placeholder package that only points here, so nobody else
can publish under it.

## 2. GitHub (org `vibebridge-ai`, repo `cli`)

Create the org `vibebridge-ai` and an empty repo `cli`, then:

```sh
git remote add origin https://github.com/vibebridge-ai/cli.git
git push -u origin main
```

Set the repo to public. The `repository` and `bugs` URLs in package.json already point here.

## 3. After release

- Tag the release: `git tag v<version> && git push --tags`.
- Link the repo from the website and from the Claude landing page.
- Consider submitting `skill/` to a skill or plugin marketplace for extra reach.

## 4. Security (EU Cyber Resilience Act)

- Vulnerability reports arrive through GitHub private vulnerability reporting (Security tab) or
  support@vibebridge.ai, see `SECURITY.md`. Private vulnerability reporting must stay enabled.
- An actively exploited vulnerability or a severe incident (hijacked npm account, tampered release,
  breach of `app.vibebridge.ai/api/mcp`) is reportable within 24 hours via the ENISA single
  reporting platform (CRA Article 14, in force since 11 September 2026). Tell Moritz at once.
- Releases published on or after 11 December 2027 need full CRA conformity (risk assessment,
  SBOM, technical documentation, EU declaration of conformity) before `npm publish`.
- npm account with 2FA or passkey. A compromised release is deprecated with
  `npm deprecate vibebridge-cli@<version> "<reason>"` and replaced by a fixed version.
