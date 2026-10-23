<script lang="ts">
	import Output from '#lib/components/output.svelte';
	import Panel from '#lib/components/panel.svelte';
	import { pb } from '#lib/pouchbase.svelte.js';
	import { parseJson, Runner } from '#lib/run.svelte.js';

	type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

	const runner = new Runner();

	let name = $state('hello');
	let method = $state<Method>('POST');
	let path = $state('');
	let query = $state('');
	let body = $state('{\n\t"name": "Ada"\n}');
</script>

<Panel title="Invoke" description="<method> /api/functions/<name>/<path> · pb.functions.invoke()">
	<div class="stack">
		<div class="row">
			<label>Name <input bind:value={name} /></label>
			<label>
				Method
				<select bind:value={method}>
					{#each ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
			<label>Path <input bind:value={path} placeholder="/42" /></label>
		</div>
		<label>Query (JSON) <input bind:value={query} placeholder={'{ "expand": "items" }'} /></label>
		<label>Body (JSON) <textarea bind:value={body} rows="6"></textarea></label>
		<div class="row">
			<button
				disabled={runner.loading || name.trim() === ''}
				onclick={() =>
					runner.run(() =>
						pb.functions.invoke(name.trim(), {
							method,
							path: path || undefined,
							query: parseJson(query) as Record<string, string> | undefined,
							body: method === 'GET' ? undefined : parseJson(body)
						})
					)}
			>
				Invoke
			</button>
		</div>
	</div>
</Panel>

<Output outcome={runner.outcome} />
