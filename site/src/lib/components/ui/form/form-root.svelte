<script lang="ts">
	import type { RemoteFormEnhanceCallback } from '$app/server';
	import { tick } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import { toast } from '../toast';
	import { setFormContext, type AnyRemoteForm } from './form-context';

	type Props = Omit<HTMLFormAttributes, 'method' | 'action'> & {
		/** Remote form function (`form(...)` from a `.remote.ts` file). */
		form: AnyRemoteForm;
		/**
		 * Custom submit handling, e.g. to close a dialog after a successful submit.
		 * Call `await instance.submit()`; it resolves to `true` when the submission succeeded.
		 */
		enhance?: RemoteFormEnhanceCallback;
		/** Toast shown when the submission succeeded, e.g. `Record saved`. */
		success?: string;
	};

	let { form, enhance, success, children, class: className, ...rest }: Props = $props();

	setFormContext({
		get form() {
			return form;
		}
	});

	// Issues that don't belong to a specific field, such as `invalid('...')` in the handler.
	const issues = $derived(form.fields.issues());

	// SvelteKit's default: reset the form after a successful submit.
	const defaultEnhance: RemoteFormEnhanceCallback = async (instance) => {
		if (await instance.submit()) {
			await tick();

			if (instance.element.isConnected) {
				HTMLFormElement.prototype.reset.call(instance.element);
			}
		}
	};

	function errorMessage(error: unknown): string {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		return typeof body?.message === 'string' ? body.message : 'Something went wrong';
	}

	/**
	 * Wraps `instance.submit()` so every form shows a toast: `success` when the submission
	 * succeeded, and an error toast (instead of the error page) when the handler threw.
	 */
	const enhanceWithToasts: RemoteFormEnhanceCallback = (instance) => {
		const submit = async () => {
			try {
				const succeeded = await instance.submit();

				if (succeeded && success) {
					toast.success(success);
				}

				return succeeded;
			} catch (error) {
				toast.error(errorMessage(error));

				return false;
			}
		};

		return (enhance ?? defaultEnhance)(Object.create(instance, { submit: { value: submit } }));
	};
</script>

<form {...form.enhance(enhanceWithToasts)} {...rest} class={['flex flex-col gap-4', className]}>
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
