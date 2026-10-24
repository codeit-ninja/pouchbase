/**
 * Adds a few test users to the built-in `users` collection of the app database, with different
 * sign-in methods, so the users grid and the auth API can be tried out.
 *
 *   pnpm seed:test-users            # add (or refresh) the test users
 *   pnpm seed:test-users --remove   # delete them again
 *
 * Every test user with a password uses TEST_PASSWORD below. Their emails start with `test.`
 * and their OAuth links use fake `test-…` account ids, so they can't sign in through a real
 * provider. Uses wrangler with the credentials from `.env`.
 */
import { execSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_PASSWORD = 'test-password-123';

/** Same format as `hashPassword` in `src/lib/server/crypto.ts`. */
const PBKDF2_ITERATIONS = 100_000;

const USERS = [
	{
		name: 'Alice Tester',
		email: 'test.alice@example.com',
		verified: true,
		password: true,
		oauth: []
	},
	{
		name: 'Bob Tester',
		email: 'test.bob@example.com',
		verified: true,
		password: true,
		oauth: [{ provider: 'github', providerId: 'test-github-1001' }]
	},
	{
		name: 'Carol Tester',
		email: 'test.carol@example.com',
		verified: true,
		password: false,
		oauth: [{ provider: 'google', providerId: 'test-google-2002' }]
	},
	{
		name: 'Dave Tester',
		email: 'test.dave@example.com',
		verified: false,
		password: false,
		oauth: [
			{ provider: 'discord', providerId: 'test-discord-3003' },
			{ provider: 'twitch', providerId: 'test-twitch-4004' }
		]
	},
	{
		// No sign-in method at all, to show how that looks.
		name: 'Erin Tester',
		email: 'test.erin@example.com',
		verified: false,
		password: false,
		oauth: []
	}
];

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function recordId() {
	return Array.from(randomBytes(15), (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

function hashPassword(password) {
	const salt = randomBytes(16);
	const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');

	return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** SQL string literal. */
function sql(value) {
	return value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

function wrangler(args) {
	return execSync(`pnpm exec wrangler ${args}`, {
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

function appDatabaseName() {
	const output = wrangler(
		`d1 execute pouchbase --remote --json --command "SELECT value FROM settings WHERE key = 'app_database_name'"`
	);
	const name = JSON.parse(output)[0]?.results[0]?.value;

	if (!name) {
		throw new Error('No app database found. Install Pouchbase first.');
	}

	return name;
}

function seedStatements() {
	const now = Date.now();

	return USERS.flatMap((user) => {
		const select = `SELECT "id" FROM "users" WHERE "email" = ${sql(user.email)}`;
		const statements = [
			`INSERT INTO "users" ("id", "created_at", "updated_at", "email", "name", "verified") SELECT ${sql(recordId())}, ${now}, ${now}, ${sql(user.email)}, ${sql(user.name)}, ${user.verified ? 1 : 0} WHERE NOT EXISTS (${select});`
		];

		if (user.password) {
			statements.push(
				`INSERT OR REPLACE INTO "_passwords" ("user_id", "hash", "updated_at") SELECT "id", ${sql(hashPassword(TEST_PASSWORD))}, ${now} FROM "users" WHERE "email" = ${sql(user.email)};`
			);
		}

		for (const link of user.oauth) {
			statements.push(
				`INSERT OR IGNORE INTO "_external_auths" ("id", "user_id", "provider", "provider_id", "created_at") SELECT ${sql(recordId())}, "id", ${sql(link.provider)}, ${sql(link.providerId)}, ${now} FROM "users" WHERE "email" = ${sql(user.email)};`
			);
		}

		return statements;
	});
}

function removeStatements() {
	const emails = USERS.map((user) => sql(user.email)).join(', ');
	const ids = `SELECT "id" FROM "users" WHERE "email" IN (${emails})`;

	return [
		`DELETE FROM "_passwords" WHERE "user_id" IN (${ids});`,
		`DELETE FROM "_external_auths" WHERE "user_id" IN (${ids});`,
		`DELETE FROM "users" WHERE "email" IN (${emails});`
	];
}

const remove = process.argv.includes('--remove');
const database = appDatabaseName();
const directory = mkdtempSync(join(tmpdir(), 'pouchbase-seed-'));
const file = join(directory, 'seed.sql');

try {
	writeFileSync(file, (remove ? removeStatements() : seedStatements()).join('\n'));
	wrangler(`d1 execute ${database} --remote --file "${file}" --yes`);
} finally {
	rmSync(directory, { recursive: true, force: true });
}

console.log(
	remove
		? `Removed the test users from ${database}.`
		: `Added ${USERS.length} test users to ${database}: ${USERS.map((user) => user.email).join(', ')}.\nUsers with a password use TEST_PASSWORD from scripts/seed-test-users.mjs.`
);
