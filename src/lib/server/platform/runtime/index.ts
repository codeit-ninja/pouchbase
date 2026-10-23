/**
 * What the runtime offers outside a request: the Worker's bindings and work that continues after
 * the response. SvelteKit 3 has no `event.platform` on Cloudflare any more; a Worker gets its
 * bindings from `cloudflare:workers` instead. This module re-exports the Node version, which
 * `vite dev` and the Node target use (no bindings, nothing to wait for); the Worker build resolves
 * the import below to `./workers` (`vite/platform.ts`).
 */
export { background, workerEnv } from './node';
