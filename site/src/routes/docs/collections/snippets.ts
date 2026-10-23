import { snippet } from '#lib/highlight.js';

export const types = snippet(
	'bash',
	`
npx @pouchbasejs/js-sdk types "https://pouchbase.example.com/api/types?token=…" --out src/pouchbase.ts`
);

export const read = snippet(
	'typescript',
	`
const { items, total, hasMore } = await pb.db.posts.findMany({
	where: {
		status: 'published', // equals
		views: { gte: 10 }, // eq, not, in, notIn, gt, gte, lt, lte
		title: { contains: 'svelte' }, // contains, notContains
		tags: { has: 'news' }, // arrays: has, isEmpty
		$or: [{ author: user.id }, { featured: true }]
	},
	orderBy: { created_at: 'desc' },
	select: ['id', 'title'], // items: { id: string; title: string }[]
	limit: 20,
	page: 1
});

const post = await pb.db.posts.find(id); // PostsRecord | null
const draft = await pb.db.posts.findFirst({ where: { status: 'draft' } }); // or null
const count = await pb.db.posts.count({ status: 'published' });

// Every record, page by page as you go
for await (const post of pb.db.posts.iterate({ orderBy: { title: 'asc' } })) {
	console.log(post.title);
}`
);

export const relations = snippet(
	'typescript',
	`
const post = await pb.db.posts.find(id, {
	include: { author: true, comments: { include: { author: true } } }
});

post?.author; // UsersRecord | null
post?.comments; // (CommentsRecord & { author: UsersRecord | null })[]`
);

export const write = snippet(
	'typescript',
	`
const created = await pb.db.posts.insert({ title: 'Hello', published: true, tags: ['news'] });
await pb.db.posts.patch(created.id, { title: 'Hello again' }); // only these fields
await pb.db.posts.remove(created.id);

// Without try/catch, e.g. in a form:
const result = await pb.db.posts.insert(values).safe();

if (!result.ok) {
	result.error.kind; // 'invalid', 'forbidden', 'conflict', …
	result.error.issues; // { title?: string; … }, typed by the fields of posts
}`
);

export const handWritten = snippet(
	'typescript',
	`
import { filter } from '@pouchbasejs/js-sdk';

// Values in \${…} are escaped.
await pb.db.posts.findMany({ where: filter\`author = @request.auth.id || title ~ \${search}\` });`
);

export const files = snippet(
	'typescript',
	`
pb.files.url(fileId); // https://pouchbase.example.com/api/files/<id>
pb.files.url(fileId, { thumb: '100x100' });
pb.files.url(fileId, { download: true });`
);

export const schema = snippet(
	'typescript',
	`
// An API key with the service scope, never in code that runs in a browser.
const pb = new Pouchbase(env.POUCHBASE_URL, { apiKey: env.POUCHBASE_SERVICE_KEY });

await pb.collections.create({
	name: 'posts',
	fields: [
		{ name: 'id', type: 'id', options: { generator: 'random' } },
		{ name: 'title', type: 'text', required: true }
	],
	rules: { list: '', view: '' } // everyone may list and view
});

// Copy the schema to another instance: matched by id, then by name.
const file = await pb.collections.export({ collections: ['posts'] });
const { plan } = await other.collections.import(file, { dryRun: true });
await other.collections.import(file, { force: true }); // force: also changes that remove data`
);
