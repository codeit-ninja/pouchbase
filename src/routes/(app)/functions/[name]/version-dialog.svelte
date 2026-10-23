<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Code from '#lib/components/ui/inputs/code/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import {
		getFunction,
		getFunctionVersionSource,
		restoreFunctionVersion
	} from '../functions.remote';
	import type { FunctionData, FunctionVersion } from '../types';

	type Props = {
		fn: FunctionData;
		version: FunctionVersion;
		/** The version that runs now can't be restored. */
		running: boolean;
	} & DialogProps;

	let { fn, version, running, close }: Props = $props();

	const id = $props.id();

	const form = $derived(restoreFunctionVersion.for(version.id));
</script>

{#snippet loading()}
	<div class="flex h-96 items-center justify-center gap-2 text-sm text-zinc-500">
		<Spinner.Root />
		Loading code…
	</div>
{/snippet}

<Dialog.Content size="lg">
	<Dialog.Header>
		<Dialog.Title id="{id}-title">{fn.name} v{version.number}</Dialog.Title>
		<Dialog.Description>
			{running ? 'The code that runs now.' : 'Restore deploys this code again as a new version.'}
		</Dialog.Description>
	</Dialog.Header>

	<svelte:boundary pending={loading}>
		{@const code = await getFunctionVersionSource({ id: fn.id, versionId: version.id })}
		<Code.Root
			value={code.source}
			language={code.language}
			readonly
			aria-labelledby="{id}-title"
			class="h-96"
		/>
	</svelte:boundary>

	<Form.Root
		{form}
		success="Version restored"
		enhance={async (instance) => {
			if (await instance.submit()) {
				await getFunction(fn.name).refresh();
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={fn.id} />
		<Form.Hidden field={form.fields.versionId} value={version.id} />

		<Dialog.Footer>
			<Dialog.Close>Close</Dialog.Close>
			{#if !running}
				<Form.Submit>Restore v{version.number}</Form.Submit>
			{/if}
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
