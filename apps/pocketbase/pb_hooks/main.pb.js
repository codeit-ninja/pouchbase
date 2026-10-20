/// <reference path="../pb_data/types.d.ts" />

// JS-hooks voor PocketBase: https://pocketbase.io/docs/js-overview/
routerAdd('GET', '/api/health/app', (e) => {
	return e.json(200, { ok: true });
});
