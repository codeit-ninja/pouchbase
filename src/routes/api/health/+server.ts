import type { RequestHandler } from './$types';

import { json } from '#lib/server/api.js';

/**
 * Liveness check for Docker and load balancers. It answers before and after installation, so it
 * only says that the process serves requests, not that the databases are reachable.
 */
export const GET: RequestHandler = () => json({ status: 'ok' });
