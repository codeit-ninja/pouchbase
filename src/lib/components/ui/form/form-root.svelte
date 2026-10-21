<script lang="ts">
	import type { RemoteFormEnhanceCallback } from '$app/server';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import { setFormContext, type AnyRemoteForm } from './form-context';

	type Props = Omit<HTMLFormAttributes, 'method' | 'action'> & {
		/** Remote form function (`form(...)` from a `.remote.ts` file). */
		form: AnyRemoteForm;
		/**
		 * Custom submit handling, e.g. to close a dialog after a successful submit.
		 * Call `await instance.submit()`; it resolves to `true` when the submission succeeded.
		 */
		enhance?: RemoteFormEnhanceCallback;
	};

	let { form, enhance, children, class: className, ...rest }: Props = $props();

	setFormContext({
		get form() {
			return form;
		}
	});

	// Issues that don't belong to a specific field, such as `invalid('...')` in the handler.
	const issues = $derived(form.fields.issues());
</script>

<form
	{...enhance ? form.enhance(enhance) : form}
	{...rest}
	class={['flex flex-col gap-4', className]}
>
	{#if issues?.length}
		<div
			role="alert"
			class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
		>
			{#each issues as issue (issue.message)}
				<p>{issue.message}</p>
			{/each}
		</div>
	{/if}

	{@render children?.()}
</form>
