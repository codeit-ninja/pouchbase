import { snippet } from '#lib/highlight.js';

export const subscribe = snippet(
	'typescript',
	`
const subscription = pb.db.posts.subscribe(
	(event) => {
		event.action; // 'create' | 'update' | 'delete'
		event.record; // typed by \`select\`; for a delete, the record as it was
	},
	{
		where: { status: 'published' },
		select: ['id', 'title'],
		onError: (error) => console.error(error) // a subscription that fails later
	}
);

await subscription.ready; // rejects with \`forbidden\`, \`not_found\` or \`invalid\`
subscription.unsubscribe();

// One record
pb.db.posts.subscribe((event) => console.log(event.record), { id: postId });

// Without the generated schema
pb.realtime.subscribe('posts', (event) => console.log(event));
pb.realtime.subscribe('posts/<id>', (event) => console.log(event));`
);

export const state = snippet(
	'typescript',
	`
pb.realtime.onState((state) => {
	// e.g. show a "live" indicator while connected
});`
);

export const protocol = snippet(
	'javascript',
	`
const socket = new WebSocket('wss://pouchbase.example.com/api/realtime?collection=posts');

socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token })); // leave out token: anonymous

socket.onmessage = ({ data }) => {
	const message = JSON.parse(data);

	if (message.type === 'ready') {
		socket.send(JSON.stringify({ type: 'subscribe', id: 'all', filter: 'status = "published"' }));
	}

	if (message.type === 'event') {
		console.log(message.action, message.record); // message.id is your subscription's id
	}
};

// Every 30 seconds; answered by {"type":"pong"}
setInterval(() => socket.send('{"type":"ping"}'), 30_000);`
);
