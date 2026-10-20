# packages

Gedeelde en publiceerbare npm-packages komen hier, bijvoorbeeld:

- `packages/cli` – de CLI
- `packages/sdk` – de JS client SDK

Elke map met een `package.json` wordt automatisch opgepikt door de pnpm workspace
(`pnpm-workspace.yaml`) en door Turborepo. Geef ze een `build`-script dat naar `dist/`
schrijft; `turbo.json` cachet die output al.
