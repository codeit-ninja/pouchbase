import type { ServerMessage } from '../../realtime/protocol';
import type { InternalPath, RecordEvent } from './hub-core';

import { describe, expect, it } from 'vitest';

import { CLOSE, LIMITS } from '../../realtime/protocol';
import { contextKey, HubCore, MemoryStore, parseClientMessage } from './hub-core';

type Call = { path: InternalPath; body: unknown; cookie?: string | null };
type Reply =
	{ status: number; body: unknown } | ((body: unknown) => { status: number; body: unknown });

const ADA = { id: 'ada', name: 'Ada' };
const GRACE = { id: 'grace', name: 'Grace' };

/** A hub with a fake clock, transport and internal routes. */
function setup(replies: Partial<Record<InternalPath, Reply>> = {}) {
	let now = 1_000_000;
	const sent: { socketId: string; message: ServerMessage }[] = [];
	const closed: { socketId: string; code: number; reason: string }[] = [];
	const calls: Call[] = [];
	const hub = new HubCore({
		collection: 'posts',
		store: new MemoryStore(),
		now: () => now,
		transport: {
			send: (socketId, message) => sent.push({ socketId, message }),
			close: (socketId, code, reason) => closed.push({ socketId, code, reason })
		},
		internal: async (path, body, cookie) => {
			calls.push({ path, body, cookie });

			const reply = replies[path];

			if (typeof reply === 'function') {
				return reply(body);
			}

			if (reply) {
				return reply;
			}

			if (path === 'session') {
				const { token } = body as { token: string | null };

				if (token === 'ada') {
					return {
						status: 200,
						body: { subject: { kind: 'user', auth: ADA }, expiresAt: now + 60_000 }
					};
				}

				if (token === 'grace') {
					return { status: 200, body: { subject: { kind: 'user', auth: GRACE }, expiresAt: null } };
				}

				return token
					? { status: 401, body: { message: 'Invalid or expired token' } }
					: { status: 200, body: { subject: { kind: 'anonymous' }, expiresAt: null } };
			}

			return { status: 200, body: {} };
		}
	});

	return {
		hub,
		sent,
		closed,
		calls,
		advance(ms: number) {
			now += ms;
		},
		messages(socketId: string) {
			return sent.filter((entry) => entry.socketId === socketId).map((entry) => entry.message);
		},
		async connect(socketId: string, token?: string, cookie: string | null = null) {
			hub.open(socketId, cookie);
			await hub.message(socketId, JSON.stringify({ type: 'auth', token }));
		},
		async subscribe(socketId: string, message: Record<string, unknown>) {
			await hub.message(socketId, JSON.stringify({ type: 'subscribe', ...message }));
		}
	};
}

function event(id: string, row: Record<string, unknown> = { id }): RecordEvent {
	return { collection: 'posts', action: 'update', id, row, at: 42 };
}

describe('parseClientMessage', () => {
	it('reads the three message types', () => {
		expect(parseClientMessage('{"type":"auth","token":"t"}')).toEqual({ type: 'auth', token: 't' });
		expect(parseClientMessage('{"type":"auth"}')).toEqual({ type: 'auth', token: undefined });
		expect(
			parseClientMessage('{"type":"subscribe","id":"a","filter":" views > 1 ","fields":["id"]}')
		).toEqual({
			type: 'subscribe',
			id: 'a',
			record: undefined,
			filter: 'views > 1',
			fields: ['id']
		});
		expect(parseClientMessage('{"type":"unsubscribe","id":"a"}')).toEqual({
			type: 'unsubscribe',
			id: 'a'
		});
	});

	it('rejects what it doesn’t know', () => {
		expect(parseClientMessage('nope')).toHaveProperty('error');
		expect(parseClientMessage('[]')).toHaveProperty('error');
		expect(parseClientMessage('{"type":"shout"}')).toHaveProperty('error');
		expect(parseClientMessage('{"type":"subscribe","id":"a b"}')).toHaveProperty('error');
		expect(parseClientMessage('{"type":"subscribe","id":"a","fields":[1]}')).toHaveProperty(
			'error'
		);
		expect(parseClientMessage('{"type":"subscribe","id":"a","record":""}')).toHaveProperty('error');
	});
});

describe('HubCore', () => {
	it('authenticates with the session route and passes the cookie on', async () => {
		const { calls, connect, messages } = setup();

		await connect('s1', 'ada', 'session=abc');

		expect(calls).toEqual([{ path: 'session', body: { token: 'ada' }, cookie: 'session=abc' }]);
		expect(messages('s1')).toEqual([{ type: 'ready', subject: 'user', expiresAt: 1_060_000 }]);
	});

	it('closes a socket with an invalid token', async () => {
		const { closed, connect } = setup();

		await connect('s1', 'wrong');

		expect(closed).toEqual([
			{ socketId: 's1', code: CLOSE.UNAUTHORIZED, reason: 'Invalid or expired token' }
		]);
	});

	it('closes a socket that doesn’t authenticate in time, and one whose token expires', async () => {
		const { hub, closed, connect, advance } = setup();

		hub.open('silent', null);
		await connect('ada', 'ada');

		advance(LIMITS.AUTH_DEADLINE_MS);
		hub.tick();
		expect(closed).toEqual([
			{ socketId: 'silent', code: CLOSE.AUTH_TIMEOUT, reason: 'No auth message' }
		]);

		advance(60_000);
		hub.tick();
		expect(closed.at(-1)).toEqual({
			socketId: 'ada',
			code: CLOSE.UNAUTHORIZED,
			reason: 'Token expired'
		});
		expect(hub.tick()).toBeNull();
	});

	it('refuses subscriptions before auth and a second auth', async () => {
		const { hub, messages, connect, subscribe } = setup();

		hub.open('s1', null);
		await subscribe('s1', { id: 'a' });
		await connect('s2');
		await hub.message('s2', '{"type":"auth"}');

		expect(messages('s1')).toEqual([
			{ type: 'error', id: 'a', code: 'not_authenticated', message: 'Send `auth` first' }
		]);
		expect(messages('s2').at(-1)).toMatchObject({ type: 'error', code: 'not_authenticated' });
	});

	it('checks subscriptions with the subscribe route and passes refusals on', async () => {
		const { calls, connect, subscribe, messages } = setup({
			subscribe: (body) =>
				(body as { filter: string | null }).filter === 'bad'
					? { status: 400, body: { code: 'invalid_filter', message: 'Unknown field `bad`' } }
					: { status: 200, body: {} }
		});

		await connect('s1', 'ada');
		await subscribe('s1', { id: 'all', fields: ['id', 'title'] });
		await subscribe('s1', { id: 'one', record: 'p1', filter: 'bad' });
		await subscribe('s1', { id: 'all' });

		expect(calls[1]).toEqual({
			path: 'subscribe',
			body: {
				collection: 'posts',
				subject: { kind: 'user', auth: ADA },
				record: null,
				filter: null,
				fields: ['id', 'title'],
				expand: null
			},
			cookie: undefined
		});
		expect(messages('s1').slice(1)).toEqual([
			{ type: 'subscribed', id: 'all' },
			{ type: 'error', id: 'one', code: 'invalid_filter', message: 'Unknown field `bad`' },
			{
				type: 'error',
				id: 'all',
				code: 'duplicate_id',
				message: 'A subscription with this id exists'
			}
		]);
	});

	it('limits the subscriptions per socket', async () => {
		const { connect, subscribe, messages } = setup();

		await connect('s1');

		for (let index = 0; index <= LIMITS.MAX_SUBSCRIPTIONS; index++) {
			await subscribe('s1', { id: `s${index}` });
		}

		expect(messages('s1').at(-1)).toMatchObject({ type: 'error', code: 'too_many_subscriptions' });
	});

	it('sends events to the subscriptions the authorize route allows, with their fields', async () => {
		const allowedFor = contextKey({ kind: 'user', auth: ADA }, null);
		const { calls, connect, subscribe, hub, messages } = setup({
			authorize: {
				status: 200,
				body: { results: [{ record: { id: 'p1', title: 'Hi', views: 3 }, allowed: [allowedFor] }] }
			}
		});

		await connect('ada', 'ada');
		await connect('grace', 'grace');
		await subscribe('ada', { id: 'all', fields: ['title'] });
		await subscribe('ada', { id: 'other', record: 'p2' });
		await subscribe('grace', { id: 'all' });
		await hub.publish([event('p1', { id: 'p1', title: 'Hi', views: 3 })]);

		const authorize = calls.find((call) => call.path === 'authorize')!;
		const { items } = authorize.body as { items: { contexts: { key: string }[] }[] };

		// Ada's subscription to `p2` doesn't match, so only one context each.
		expect(items[0].contexts.map((context) => context.key)).toEqual([
			allowedFor,
			contextKey({ kind: 'user', auth: GRACE }, null)
		]);
		expect(messages('ada').at(-1)).toEqual({
			type: 'event',
			id: 'all',
			action: 'update',
			record: { title: 'Hi' },
			at: 42
		});
		expect(messages('grace').at(-1)).toEqual({ type: 'subscribed', id: 'all' });
	});

	it('sends the expanded record of each context, keeping the expanded fields', async () => {
		const plain = contextKey({ kind: 'user', auth: ADA }, null);
		const expanded = contextKey({ kind: 'user', auth: ADA }, null, ['author']);
		const { calls, connect, subscribe, hub, messages } = setup({
			authorize: {
				status: 200,
				body: {
					results: [
						{
							record: { id: 'p1', title: 'Hi', author: 'ada' },
							allowed: [plain, expanded],
							expanded: { [expanded]: { id: 'p1', title: 'Hi', author: ADA } }
						}
					]
				}
			}
		});

		await connect('ada', 'ada');
		await subscribe('ada', { id: 'ids' });
		await subscribe('ada', { id: 'records', fields: ['title'], expand: ['author'] });
		await hub.publish([event('p1', { id: 'p1', title: 'Hi', author: 'ada' })]);

		const authorize = calls.find((call) => call.path === 'authorize')!;
		const { items } = authorize.body as { items: { contexts: { expand: unknown }[] }[] };

		expect(calls.filter((call) => call.path === 'subscribe').at(-1)?.body).toMatchObject({
			expand: ['author']
		});
		expect(items[0].contexts.map((context) => context.expand)).toEqual([null, ['author']]);
		expect(messages('ada').slice(-2)).toEqual([
			{
				type: 'event',
				id: 'ids',
				action: 'update',
				record: { id: 'p1', title: 'Hi', author: 'ada' },
				at: 42
			},
			{
				type: 'event',
				id: 'records',
				action: 'update',
				record: { title: 'Hi', author: ADA },
				at: 42
			}
		]);
	});

	it('refuses an invalid expand', () => {
		expect(parseClientMessage('{"type":"subscribe","id":"a","expand":"author"}')).toHaveProperty(
			'error'
		);
		expect(parseClientMessage('{"type":"subscribe","id":"a","expand":["author.team"]}')).toEqual({
			type: 'subscribe',
			id: 'a',
			expand: ['author.team']
		});
	});

	it('doesn’t call authorize without subscribers, or for other collections', async () => {
		const { calls, connect, hub } = setup();

		await connect('s1');
		await hub.publish([event('p1')]);
		await hub.publish([{ ...event('p1'), collection: 'comments' }]);

		expect(calls.map((call) => call.path)).toEqual(['session']);
	});

	it('stops sending after unsubscribe and after close', async () => {
		const key = contextKey({ kind: 'anonymous' }, null);
		const { connect, subscribe, hub, messages } = setup({
			authorize: { status: 200, body: { results: [{ record: { id: 'p1' }, allowed: [key] }] } }
		});

		await connect('s1');
		await connect('s2');
		await subscribe('s1', { id: 'a' });
		await subscribe('s2', { id: 'a' });
		await hub.message('s1', '{"type":"unsubscribe","id":"a"}');
		hub.closed('s2');
		await hub.publish([event('p1')]);

		expect(messages('s1').at(-1)).toEqual({ type: 'unsubscribed', id: 'a' });
		expect(messages('s2').at(-1)).toEqual({ type: 'subscribed', id: 'a' });
	});

	it('closes a socket after too many invalid messages', async () => {
		const { hub, closed } = setup();

		hub.open('s1', null);

		for (let index = 0; index < LIMITS.MAX_STRIKES; index++) {
			await hub.message('s1', 'garbage');
		}

		expect(closed).toEqual([
			{ socketId: 's1', code: CLOSE.PROTOCOL_ERROR, reason: 'Too many invalid messages' }
		]);
	});

	it('closes a socket that sends a message that is too big', async () => {
		const { hub, closed } = setup();

		hub.open('s1', null);
		await hub.message('s1', 'x'.repeat(LIMITS.MAX_MESSAGE_BYTES + 1));

		expect(closed[0]).toMatchObject({ code: CLOSE.MESSAGE_TOO_BIG });
	});
});
