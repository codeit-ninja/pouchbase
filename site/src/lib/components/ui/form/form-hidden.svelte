<script lang="ts">
	import type { AnyRemoteFormField } from './form-context';

	type Props = {
		/** Field of a remote form, e.g. `myForm.fields.id`. */
		field: AnyRemoteFormField;
		/** Booleans are sent as `on`/`off` and parsed back into a boolean. */
		value: string | boolean;
	};

	let { field, value }: Props = $props();
</script>

<input {...field.as('hidden', value)} />
