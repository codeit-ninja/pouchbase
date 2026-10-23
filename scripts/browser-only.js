// Stands in for browser-only packages that the server build still imports, so bundling the Worker
// doesn't pull them in (see "alias" in wrangler.jsonc). The server never loads them.
export default {};
