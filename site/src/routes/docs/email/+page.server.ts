import type { PageServerLoad } from './$types';

import { highlightAll } from '#lib/server/highlight.js';

import * as snippets from './snippets';

export const load: PageServerLoad = () => ({ code: highlightAll(snippets) });
