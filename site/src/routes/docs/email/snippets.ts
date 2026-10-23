import { snippet } from '#lib/highlight.js';

export const variables = snippet(
	'html',
	`
<h1>Welcome, {{ name | there }}!</h1>

{{#if trial}}
	<p>Your trial ends on {{ trial.endsOn }}.</p>
{{else}}
	<p>Thanks for subscribing.</p>
{{/if}}

<ul>
	{{#each items}}
		<li>{{ @number }}. {{ title }} ({{ currency | EUR }})</li>
	{{/each}}
</ul>`
);

export const fn = snippet(
	'typescript',
	`
import { Pouchbase } from '@pouchbasejs/js-sdk';

interface Env {
	POUCHBASE_URL: string;
	POUCHBASE_API_KEY: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const pb = new Pouchbase(env.POUCHBASE_URL, { apiKey: env.POUCHBASE_API_KEY });

		await pb.mail.send({
			template: 'welcome',
			to: 'ada@example.com',
			variables: { name: 'Ada', items: [{ title: 'Create a project' }] }
		});

		return Response.json({ sent: true });
	}
};`
);

export const curl = snippet(
	'bash',
	`
curl -X POST https://pouchbase.example.com/api/mail/send \\
	-H "Authorization: Bearer $POUCHBASE_API_KEY" \\
	-H "Content-Type: application/json" \\
	-d '{"template":"welcome","to":["ada@example.com"],"variables":{"name":"Ada"}}'`
);

export const missing = snippet(
	'json',
	`
{
	"message": "Missing variables: name",
	"issues": { "variables.name": "Required" }
}`
);
