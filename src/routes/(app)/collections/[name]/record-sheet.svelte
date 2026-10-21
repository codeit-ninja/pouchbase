<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { signInMethodInfo, type SignInMethod } from '#lib/auth/sign-in-methods.js';
	import { USERS_COLLECTION } from '#lib/auth/users.js';
	import { formatTimestamp, type GridField, type GridRecord } from './grid';
	import RecordFieldInput from './record-field-input.svelte';
	import { saveRecord } from './records.remote';

	type Props = {
		collection: { name: string };
		fields: GridField[];
		/** The record to edit; `null` creates a new one. */
		record: GridRecord | null;
		/** Only for the built-in `users` collection: how this user can sign in. */
		signInMethods?: SignInMethod[];
		open?: boolean;
		onDelete: (id: string) => void;
	};

	let {
		collection,
		fields,
		record,
		signInMethods = [],
		open = $bindable(false),
		onDelete
	}: Props = $props();

	// A separate form instance per record, so values and issues don't leak between records.
	const form = $derived(saveRecord.for(record?.id ?? 'new'));
</script>

<Sheet.Root bind:open>
	<Sheet.Content>
		<Sheet.Header>
			<Sheet.Title>{record ? 'Edit record' : 'New record'}</Sheet.Title>
			<Sheet.Description>
				{#if record}
					<span class="font-mono">{record.id}</span> · updated {formatTimestamp(record.updated_at)}
					UTC
				{:else}
					Adds a row to <span class="font-mono">{collection.name}</span>
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		<Form.Root
			{form}
			class="min-h-0 flex-1 gap-0"
			enhance={async (instance) => {
				if (await instance.submit()) {
					instance.element.reset();
					open = false;
				}
			}}
		>
			<Form.Hidden field={form.fields.collection} value={collection.name} />
			<Form.Hidden field={form.fields.id} value={record?.id ?? ''} />

			<Sheet.Body>
				{#each fields as field (field.id)}
					<RecordFieldInput
						{field}
						formField={form.fields.values[field.name]}
						value={record?.[field.name]}
					/>
				{:else}
					<p class="text-sm text-zinc-500">
						This collection has no fields yet. Saving creates a record with only the system fields.
					</p>
				{/each}

				{#if collection.name === USERS_COLLECTION && record}
					<section class="flex flex-col gap-2" aria-labelledby="sign-in-methods">
						<h3 id="sign-in-methods" class="text-sm font-medium text-zinc-900">Sign-in methods</h3>

						<Table.Root>
							<Table.Body>
								{#each signInMethods as method, index (`${method.provider}:${method.providerId ?? index}`)}
									{@const info = signInMethodInfo(method.provider)}

									<Table.Row>
										<Table.Cell>
											<span class="inline-flex items-center gap-2 font-medium text-zinc-900">
												<Icon.Root icon={info.icon} class="size-4" />
												{info.label}
											</span>
										</Table.Cell>
										<Table.Cell class="font-mono text-xs text-zinc-500">
											{method.providerId ?? ''}
										</Table.Cell>
										<Table.Cell class="text-right text-xs whitespace-nowrap text-zinc-500">
											{method.provider === 'password' ? 'set' : 'linked'}
											{formatTimestamp(method.linkedAt)}
										</Table.Cell>
									</Table.Row>
								{:else}
									<Table.Row>
										<Table.Cell class="text-zinc-500">
											This user can't sign in yet: no linked accounts and no password.
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</section>
				{/if}

				{#if collection.name === USERS_COLLECTION}
					<Form.Field field={form.fields._password}>
						<Form.Label class="font-mono">password</Form.Label>
						<Form.Input type="password" autocomplete="new-password" />
						<Form.Description>
							{record
								? 'Leave empty to keep the current password.'
								: 'Lets the user sign in with their username and this password.'}
						</Form.Description>
						<Form.Errors />
					</Form.Field>
				{/if}
			</Sheet.Body>

			<Sheet.Footer>
				{#if record}
					<Button.Root
						type="button"
						variant="ghost"
						class="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
						onclick={() => onDelete(record.id)}
					>
						<Icon.Root icon="lucide:trash-2" />
						Delete
					</Button.Root>
				{/if}

				<Sheet.Close>Cancel</Sheet.Close>
				<Form.Submit>{record ? 'Save changes' : 'Create record'}</Form.Submit>
			</Sheet.Footer>
		</Form.Root>
	</Sheet.Content>
</Sheet.Root>
