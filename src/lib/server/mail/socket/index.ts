/**
 * Opens SMTP connections for the runtime the app runs on. This module re-exports the Node version,
 * which `vite dev` and the Node target use. The Worker build resolves the import below to
 * `./workers` instead (`vite/platform.ts`), so the Worker bundle never sees `node:net`.
 */
export { openConnection } from './node';
