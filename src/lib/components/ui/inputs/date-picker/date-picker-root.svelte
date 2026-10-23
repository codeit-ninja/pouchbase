<script module lang="ts">
	export type Props = {
		/** The date and time as ISO 8601 text in UTC (e.g. `2026-01-31T09:30:00Z`); empty for none. */
		value?: string;
		/** Name of a hidden input, so the value is submitted with a form. */
		name?: string;
		/** Locale for the order of the segments and the names of months and weekdays. */
		locale?: string;
		id?: string;
		disabled?: boolean;
		readonly?: boolean;
		/** Hides the clear button. */
		required?: boolean;
		class?: string;
		/** Called after every change made in the picker. */
		onValueChange?: (value: string) => void;
		'aria-invalid'?: boolean | 'true' | 'false';
		'aria-describedby'?: string;
		'aria-labelledby'?: string;
	};
</script>

<script lang="ts">
	import { CalendarDateTime, toCalendarDateTime, type DateValue } from '@internationalized/date';
	import { DatePicker } from 'bits-ui';
	import * as Icon from '../../icon';

	let {
		value = $bindable(''),
		name,
		locale = 'en-GB',
		id,
		disabled = false,
		readonly = false,
		required = false,
		class: className,
		onValueChange,
		...aria
	}: Props = $props();

	// Dates are picked and shown in UTC, so the picker works with a date and time without a zone.
	function toDate(text: string): CalendarDateTime | undefined {
		const time = text ? Date.parse(text) : NaN;

		if (Number.isNaN(time)) {
			return undefined;
		}

		const date = new Date(time);

		return new CalendarDateTime(
			date.getUTCFullYear(),
			date.getUTCMonth() + 1,
			date.getUTCDate(),
			date.getUTCHours(),
			date.getUTCMinutes()
		);
	}

	function toText(date: DateValue | undefined) {
		return date ? `${toCalendarDateTime(date).toString().slice(0, 16)}:00Z` : '';
	}

	// Follows `value`, so changes from outside (e.g. a form reset) are shown in the picker.
	const date = $derived(toDate(value));

	function update(next: DateValue | undefined) {
		value = toText(next);
		onValueChange?.(value);
	}
</script>

{#if name}
	<input type="hidden" {name} {value} />
{/if}

<DatePicker.Root
	bind:value={() => date, update}
	{locale}
	{disabled}
	{readonly}
	granularity="minute"
	hourCycle={24}
	weekStartsOn={1}
	weekdayFormat="short"
	fixedWeeks
>
	<DatePicker.Input
		{id}
		{...aria}
		class={[
			'flex h-control w-full items-center gap-0.5 rounded-md border border-zinc-300 bg-white pr-1 pl-3 text-sm text-zinc-900 shadow-xs focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10 aria-invalid:border-red-500 aria-invalid:ring-red-500/10 data-disabled:cursor-not-allowed data-disabled:opacity-50',
			className
		]}
	>
		{#snippet children({ segments })}
			<span class="flex flex-1 items-center tabular-nums">
				{#each segments as { part, value: text }, index (index)}
					{#if part === 'literal'}
						<DatePicker.Segment {part} class="px-px text-zinc-400">{text}</DatePicker.Segment>
					{:else}
						<DatePicker.Segment
							{part}
							class="rounded px-0.5 outline-none focus:bg-zinc-900 focus:text-white aria-[valuetext=Empty]:text-zinc-400 focus:aria-[valuetext=Empty]:text-white"
						>
							{text}
						</DatePicker.Segment>
					{/if}
				{/each}
			</span>

			{#if date && !required && !disabled && !readonly}
				<button
					type="button"
					class="flex size-6 items-center justify-center rounded text-zinc-400 outline-none hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-900/10"
					aria-label="Clear date"
					onclick={() => update(undefined)}
				>
					<Icon.Root icon="lucide:x" class="size-3.5" />
				</button>
			{/if}

			<DatePicker.Trigger
				class="flex size-6 items-center justify-center rounded text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed"
				aria-label="Open calendar"
			>
				<Icon.Root icon="lucide:calendar" class="size-4" />
			</DatePicker.Trigger>
		{/snippet}
	</DatePicker.Input>

	<DatePicker.Portal>
		<DatePicker.Content
			sideOffset={4}
			align="start"
			class="z-50 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg outline-none"
		>
			<DatePicker.Calendar>
				{#snippet children({ months, weekdays })}
					<DatePicker.Header class="mb-2 flex items-center justify-between gap-2">
						<DatePicker.PrevButton
							class="flex size-8 items-center justify-center rounded-md text-zinc-600 outline-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 data-disabled:cursor-not-allowed data-disabled:opacity-50"
							aria-label="Previous month"
						>
							<Icon.Root icon="lucide:chevron-left" class="size-4" />
						</DatePicker.PrevButton>
						<DatePicker.Heading class="text-sm font-medium text-zinc-900" />
						<DatePicker.NextButton
							class="flex size-8 items-center justify-center rounded-md text-zinc-600 outline-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 data-disabled:cursor-not-allowed data-disabled:opacity-50"
							aria-label="Next month"
						>
							<Icon.Root icon="lucide:chevron-right" class="size-4" />
						</DatePicker.NextButton>
					</DatePicker.Header>

					{#each months as month (month.value.toString())}
						<DatePicker.Grid class="border-collapse select-none">
							<DatePicker.GridHead>
								<DatePicker.GridRow class="flex">
									{#each weekdays as weekday, index (index)}
										<DatePicker.HeadCell class="w-8 pb-1 text-xs font-normal text-zinc-500">
											{weekday.slice(0, 2)}
										</DatePicker.HeadCell>
									{/each}
								</DatePicker.GridRow>
							</DatePicker.GridHead>

							<DatePicker.GridBody>
								{#each month.weeks as week, index (index)}
									<DatePicker.GridRow class="flex">
										{#each week as day (day.toString())}
											<DatePicker.Cell date={day} month={month.value} class="size-8 p-0">
												<DatePicker.Day
													class="flex size-8 cursor-pointer items-center justify-center rounded-md text-sm text-zinc-700 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-900/20 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-outside-month:text-zinc-300 data-selected:bg-zinc-900 data-selected:text-white data-today:font-semibold data-today:underline data-today:underline-offset-4"
												/>
											</DatePicker.Cell>
										{/each}
									</DatePicker.GridRow>
								{/each}
							</DatePicker.GridBody>
						</DatePicker.Grid>
					{/each}
				{/snippet}
			</DatePicker.Calendar>
		</DatePicker.Content>
	</DatePicker.Portal>
</DatePicker.Root>
