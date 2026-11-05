# Security Policy

The VibeBridge CLI is made by Kompass Consulting GmbH, Waagner-Biro-Straße 47/1, 8020 Graz, Austria.

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Preferred: use **Report a vulnerability** on the Security tab of this repository (GitHub private vulnerability reporting).
- Or email **support@vibebridge.ai** with the subject `Security: <short title>`.

Please include the CLI version (`vibebridge --version`), your Node.js version and operating system, the steps to reproduce, and what an attacker could achieve. If the issue affects the VibeBridge service behind the CLI (`app.vibebridge.ai/api/mcp`), report it the same way.

## What happens next

- We confirm your report within 2 working days.
- We assess it and tell you our plan within 7 days.
- We fix confirmed vulnerabilities in the latest release and publish a GitHub security advisory. We credit you unless you prefer to stay anonymous.
- We ask you to keep the details private until a fix is available, at most 90 days after your report.

If a vulnerability is actively exploited, we report it as required by Article 14 of the EU Cyber Resilience Act (Regulation (EU) 2024/2847).

## Supported versions

Security fixes are released for the latest version only. Updating is free: run `npx vibebridge-cli@latest` or `npm install -g vibebridge-cli@latest`.

| Version | Supported |
|---|---|
| latest 0.x | yes |
| older | no, please update |
