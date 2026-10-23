<script lang="ts">
	import { motion, useReducedMotion } from 'motion-sv';
	import logo from '#lib/assets/logo.svg';

	/**
	 * A fixed 560×440 scene that is scaled to its container (see the wrapper's `scale`), so the
	 * curves below can use plain pixel coordinates.
	 */
	const WIDTH = 560;
	const HEIGHT = 440;

	/** Records that stream into the pouch, each along its own curve (SVG path syntax). */
	const records = [
		{
			id: 'user',
			label: '{ "name": "Ada", "verified": true }',
			color: 'bg-brand-500',
			path: 'M -200 40 C 40 40, 120 180, 290 220',
			duration: 7,
			delay: 0
		},
		{
			id: 'file',
			label: 'avatar.png · 48 KB',
			color: 'bg-sky-500',
			path: 'M -160 400 C 60 400, 140 260, 290 230',
			duration: 8,
			delay: 1.6
		},
		{
			id: 'sign-in',
			label: 'POST /api/auth/password/sign-in',
			color: 'bg-emerald-500',
			path: 'M 760 30 C 520 30, 420 150, 300 215',
			duration: 7.5,
			delay: 3.1
		},
		{
			id: 'oauth',
			label: 'oauth2/github · 200 OK',
			color: 'bg-violet-500',
			path: 'M 740 410 C 520 410, 420 300, 300 235',
			duration: 8.5,
			delay: 4.4
		},
		{
			id: 'record',
			label: 'posts · 1,204 records',
			color: 'bg-brand-400',
			path: 'M -180 220 C 20 220, 120 230, 290 226',
			duration: 9,
			delay: 5.8
		}
	];

	const reduced = useReducedMotion();

	/** Keyframes for one record: travel the curve, then shrink into the pouch. */
	function travel() {
		if (reduced.current) {
			return undefined;
		}

		return {
			offsetDistance: ['0%', '100%'],
			scale: [1, 1, 0.4],
			opacity: [1, 1, 0]
		};
	}
</script>

<div
	class="[container-type:inline-size] relative mx-auto w-full max-w-[560px] overflow-hidden"
	style:aspect-ratio="{WIDTH} / {HEIGHT}"
	aria-hidden="true"
>
	<!-- Dot grid, fading out towards the edges. -->
	<div
		class="absolute inset-0 bg-[radial-gradient(circle,var(--color-zinc-300)_1px,transparent_1.5px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_72%)] bg-[size:22px_22px]"
	></div>

	<div
		class="absolute top-0 left-0 origin-top-left [scale:tan(atan2(100cqw,560px))]"
		style:width="{WIDTH}px"
		style:height="{HEIGHT}px"
	>
		<!-- Glow behind the pouch. -->
		<motion.div
			class="absolute top-1/2 left-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--color-brand-400)_0%,transparent_65%)] opacity-50"
			animate={reduced.current ? undefined : { opacity: [0.4, 0.7, 0.4], scale: [1, 1.08, 1] }}
			transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
		/>

		<!-- Orbits: two slowly turning dashed rings. -->
		<motion.div
			class="absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-brand-300/80"
			animate={reduced.current ? undefined : { rotate: 360 }}
			transition={{ duration: 90, ease: 'linear', repeat: Infinity }}
		/>
		<motion.div
			class="absolute top-1/2 left-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-zinc-300"
			animate={reduced.current ? undefined : { rotate: -360 }}
			transition={{ duration: 140, ease: 'linear', repeat: Infinity }}
		/>

		<!-- The pouch itself: the logo, breathing. -->
		<motion.div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
			animate={reduced.current ? undefined : { scale: [1, 1.04, 1] }}
			transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
		>
			<img src={logo} alt="" class="size-44 drop-shadow-[0_24px_40px_rgba(246,130,31,0.35)]" />
		</motion.div>

		<!-- Records streaming in. -->
		{#each records as record, index (record.id)}
			<motion.div
				class="absolute top-0 left-0 flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 py-1.5 pr-3.5 pl-2.5 font-mono text-xs whitespace-nowrap text-zinc-700 shadow-md shadow-zinc-900/5 backdrop-blur-sm"
				style={{
					offsetPath: `path("${record.path}")`,
					offsetRotate: '0deg',
					offsetDistance: reduced.current ? `${30 + index * 12}%` : '0%',
					offsetAnchor: 'center'
				}}
				animate={travel()}
				transition={{
					duration: record.duration,
					delay: record.delay,
					ease: 'linear',
					repeat: Infinity,
					times: [0, 0.86, 1]
				}}
			>
				<span class={['size-2 rounded-full', record.color]}></span>
				{record.label}
			</motion.div>
		{/each}
	</div>
</div>
