import {
	isPluginCategory,
	PLUGIN_CATEGORIES,
	PLUGIN_CATEGORY_LABELS
} from '@pouchbasejs/plugin-sdk';

/** The categories to filter by, in the order the SDK lists them. */
export const categories = PLUGIN_CATEGORIES.map((id) => ({
	id,
	label: PLUGIN_CATEGORY_LABELS[id]
}));

/** The name of a category; the id itself for one this site doesn't know yet. */
export function categoryLabel(id: string) {
	return isPluginCategory(id) ? PLUGIN_CATEGORY_LABELS[id] : id;
}
