<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Link from '#lib/components/ui/link/index.js';
	import type { Variables } from '#lib/mail/template.js';

	type Props = { name: string; sampleData: Variables };

	let { name, sampleData }: Props = $props();

	function indent(value: unknown, depth: number) {
		return JSON.stringify(value, null, '\t').replace(/\n/g, `\n${'\t'.repeat(depth)}`);
	}

	const fn = $derived(`import { Pouchbase } from '@pouchbasejs/js-sdk';

export default {
	async fetch(request, env) {
		const pb = new Pouchbase(env.POUCHBASE_URL, { apiKey: env.POUCHBASE_API_KEY });

		await pb.mail.send({
			template: '${name}',
			to: 'ada@example.com',
			variables: ${indent(sampleData, 3)}
		});

		return Response.json({ sent: true });
	}
};`);

	const curl = $derived(`curl ${page.url.origin}/api/mail/send \\
	-H "Authorization: Bearer $POUCHBASE_API_KEY" \\
	-H "Content-Type: application/json" \\
	-d '${JSON.stringify({ template: name, to: 'ada@example.com', variables: sampleData }).replace(/'/g, "'\\''")}'`);
</script>

<div class="flex flex-col gap-4 text-sm text-zinc-600">
	<p>
		Send the template with an API key. A function has its own key in
		<code>env.POUCHBASE_API_KEY</code>; for your back-end, create one on the
		<Link.Root href={resolve('/(app)/api-keys')}>API keys</Link.Root> page. Keep keys on the server: an
		app in the browser can't send email.
	</p>

	<CodeBlock.Root title="In a function, with the JS SDK" code={fn} />
	<CodeBlock.Root title="From anywhere else" code={curl} />

	<p>
		<code>to</code> takes one address or a list of up to 50; each recipient gets an email of their
		own. A missing required variable answers <code>422</code>.
	</p>
</div>
