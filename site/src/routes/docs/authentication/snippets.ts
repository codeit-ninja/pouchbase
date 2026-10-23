import { snippet } from '#lib/highlight.js';

export const client = snippet(
	'typescript',
	`
import { createClient, LocalAuthStore } from '@pouchbasejs/js-sdk';
import type { Schema } from './pouchbase'; // generated, see Collections and records

export const pb = createClient<Schema>('https://pouchbase.example.com', {
	// Keeps users signed in across reloads; the default store keeps the token in memory.
	authStore: new LocalAuthStore()
});`
);

export const password = snippet(
	'typescript',
	`
import { isPouchbaseError } from '@pouchbasejs/js-sdk';

await pb.auth.signUp({ username: 'ada', password: 'correct horse battery staple', email: 'ada@example.com' });

try {
	await pb.auth.signIn('ada@example.com', 'correct horse battery staple'); // username or email
} catch (error) {
	if (isPouchbaseError(error, 'unauthorized')) {
		// Wrong username, email or password.
	}
}

const user = await pb.auth.me(); // UsersRecord | null
pb.authStore.onChange((state) => console.log(state)); // after sign-ins and sign-outs
pb.auth.signOut();`
);

export const oauth = snippet(
	'typescript',
	`
const providers = await pb.auth.providers(); // [{ provider: 'github', label: 'GitHub' }, …]

button.addEventListener('click', async () => {
	try {
		await pb.auth.signInWithOAuth('github');
	} catch (error) {
		// error.code: access_denied, email_in_use, sign_in_failed, popup_blocked, popup_closed or timeout
	}
});`
);

export const mail = snippet(
	'typescript',
	`
await pb.auth.requestVerification('ada@example.com');
await pb.auth.requestPasswordReset('ada@example.com');

// Only needed when you handle the links in your own app instead of Pouchbase's pages:
await pb.auth.confirmVerification(token);
await pb.auth.confirmPasswordReset(token, 'a new password');`
);
