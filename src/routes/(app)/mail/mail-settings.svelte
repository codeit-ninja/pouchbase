<script lang="ts">
	import { untrack } from 'svelte';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { mailSettingsSchema, testMailSchema } from '#lib/schemas/mail.js';
	import { getMailSettings, sendTestMail, updateMailSettings } from './mail.remote';

	const settings = $derived(await getMailSettings());

	// Shows the fields of the chosen provider before the settings are saved.
	let provider = $state(untrack(() => settings.provider));

	const mailForm = updateMailSettings.preflight(mailSettingsSchema);
	const testForm = sendTestMail.preflight(testMailSchema);

	const providers = $derived([
		{ value: 'none', label: "Don't send email", icon: 'lucide:mail-x' },
		{
			value: 'cloudflare',
			label: 'Cloudflare Email Service',
			description: settings.cloudflareAvailable
				? 'Uses the Cloudflare API token of this app'
				: 'Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN',
			icon: 'lucide:cloud',
			disabled: !settings.cloudflareAvailable
		},
		{
			value: 'smtp',
			label: 'SMTP server',
			description: 'Any provider: Postmark, Resend, Amazon SES, …',
			icon: 'lucide:server'
		}
	]);

	const security = [
		{ value: 'tls', label: 'TLS (usually port 465)' },
		{ value: 'starttls', label: 'STARTTLS (usually port 587)' },
		{ value: 'none', label: 'None (not recommended)' }
	];
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Sending</Card.Title>
		<Card.Description>
			Used for your templates and for the verification and password reset emails to the users of
			your app.
		</Card.Description>
	</Card.Header>

	<Card.Content>
		<!-- Not reset after saving: the fields keep showing what was saved. -->
		<Form.Root
			form={mailForm}
			success="Mail settings saved"
			enhance={async (instance) => {
				await instance.submit();
			}}
		>
			<Form.Field field={mailForm.fields.provider}>
				<Form.Label>Send with</Form.Label>
				<Form.Select
					items={providers}
					defaultValue={settings.provider}
					onValueChange={(next) => (provider = next as typeof provider)}
				/>
				<Form.Errors />
			</Form.Field>

			{#if provider === 'cloudflare'}
				<Callout.Root>
					<Callout.Icon><Icon.Root icon="lucide:info" /></Callout.Icon>
					<Callout.Body>
						<Callout.Description>
							Onboard the sender's domain under Email Service → Email Sending in the Cloudflare
							dashboard, and give the API token the "Email Sending: Edit" permission.
						</Callout.Description>
					</Callout.Body>
				</Callout.Root>
			{/if}

			<!-- Hidden rather than removed, so the stored values are submitted unchanged. -->
			<div class="flex flex-col gap-4" hidden={provider === 'none'}>
				<div class="grid gap-4 sm:grid-cols-2">
					<Form.Field field={mailForm.fields.senderName}>
						<Form.Label>Sender name</Form.Label>
						<Form.Input defaultValue={settings.senderName} autocomplete="off" />
						<Form.Errors />
					</Form.Field>

					<Form.Field field={mailForm.fields.senderAddress}>
						<Form.Label>Sender address</Form.Label>
						<Form.Input
							type="email"
							defaultValue={settings.senderAddress}
							placeholder="noreply@example.com"
							autocomplete="off"
						/>
						<Form.Errors />
					</Form.Field>
				</div>
			</div>

			<div class="flex flex-col gap-4" hidden={provider !== 'smtp'}>
				<div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
					<Form.Field field={mailForm.fields.smtpHost}>
						<Form.Label>SMTP server</Form.Label>
						<Form.Input
							defaultValue={settings.smtpHost}
							placeholder="smtp.example.com"
							autocomplete="off"
						/>
						<Form.Errors />
					</Form.Field>

					<Form.Field field={mailForm.fields.smtpPort}>
						<Form.Label>Port</Form.Label>
						<Form.Input type="number" defaultValue={String(settings.smtpPort)} />
						<Form.Errors />
					</Form.Field>
				</div>

				<Form.Field field={mailForm.fields.smtpSecurity}>
					<Form.Label>Encryption</Form.Label>
					<Form.Select items={security} defaultValue={settings.smtpSecurity} />
					<Form.Errors />
				</Form.Field>

				<div class="grid gap-4 sm:grid-cols-2">
					<Form.Field field={mailForm.fields.smtpUsername}>
						<Form.Label>Username</Form.Label>
						<Form.Input defaultValue={settings.smtpUsername} autocomplete="off" />
						<Form.Errors />
					</Form.Field>

					<Form.Field field={mailForm.fields._smtpPassword}>
						<Form.Label>Password</Form.Label>
						<Form.Input
							type="password"
							autocomplete="new-password"
							placeholder={settings.hasSmtpPassword ? 'Stored — leave empty to keep it' : ''}
						/>
						<Form.Errors />
					</Form.Field>
				</div>
			</div>

			<div class="flex justify-end">
				<Form.Submit>Save</Form.Submit>
			</div>
		</Form.Root>
	</Card.Content>
</Card.Root>

{#if settings.provider !== 'none'}
	<Card.Root>
		<Card.Header>
			<Card.Title>Test email</Card.Title>
			<Card.Description>Sends an email with the saved settings.</Card.Description>
		</Card.Header>

		<Card.Content>
			<Form.Root form={testForm} success="Test email sent">
				<Form.Field field={testForm.fields.to}>
					<Form.Label>Send to</Form.Label>
					<Form.Input type="email" placeholder="you@example.com" autocomplete="email" />
					<Form.Errors />
				</Form.Field>

				<div class="flex justify-end">
					<Form.Submit>
						<Icon.Root icon="lucide:send" />
						Send test email
					</Form.Submit>
				</div>
			</Form.Root>
		</Card.Content>
	</Card.Root>
{/if}
