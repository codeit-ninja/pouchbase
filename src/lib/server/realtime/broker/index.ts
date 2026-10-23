/**
 * Hands saved changes to the realtime hub of their collection. This module re-exports the Node
 * version (the `ws` hub in this process), which `vite dev` and the Node target use. The Worker
 * build resolves the import below to `./workers` instead (`vite/platform.ts`): the collection's
 * Durable Object. So the Worker bundle never sees `ws`.
 */
export { publish } from './node';
