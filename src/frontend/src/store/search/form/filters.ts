/**
 * This module contains a single entry for every metadata field in this corpus.
 * It contains the current ui state for frequency list form.
 *
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */
import Vue from 'vue';
import { getStoreBuilder } from 'vuex-typex';

import { RootState } from '@/store/search/';
import * as CorpusModule from '@/store/search/corpus';

import { debugLog } from '@/utils/debug';
import { paths } from '@/api';
import { getFilterString, mapReduce, getFilterSummary, MapOf } from '@/utils';
import { RemoveProperties } from '@/types/helpers';

export type FullFilterState = FilterDefinition&FilterState;

export type Group = {
	id: string;
	fields: string[];
};

export type FilterDefinition = {
	/** Id of the filters, this must be unique */
	id: string;
	/** Some filters are custom and do not map back directly to a metadata field. Essentially allFilters[id] == null */
	isMetadataField: boolean;
	displayName: string;
	description?: string;
	/** Name of the component, for filters generated from the blacklab index metadata, `filter-${uiType}` */
	componentName: string;

	/**
	 * Other info the filter component may require, such as options in a dropdown list for a filter of type Select.
	 * This is usually empty for the normal text, range, autocomplete types. But for select, radio, and checkbox this contains the available options.
	 * For 'pos' this contains the tagset.
	 * Custom filter types may place whatever data they require here and it will be made available as a prop.
	 */
	metadata: any;
};

export type FilterState = {
	id: string;
	lucene: string|null;
	value: any|null;
	summary: string|null;
};

type ModuleRootState = {
	filterGroups: Group[];

	filterDefs: MapOf<FilterDefinition>;
	filterStates: MapOf<FilterState>;
};

type ExternalModuleRootState = ModuleRootState['filterStates'];

/** Populated on store initialization and afterwards */
const initialState: ModuleRootState = {
	filterGroups: [],
	filterDefs: {},
	filterStates: {},
};

const namespace = 'filters';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, Object.assign({}, initialState));
const getState = b.state();

const get = {
	luceneQuery: b.read(state => {
		// NOTE: sort the filters so a stable query is created
		// this is important for comparing history entries
		const activeFilters: FilterState[] = get.activeFilters();
		return getFilterString(activeFilters);
	} , 'luceneQuery'),
	luceneQuerySummary: b.read(state => {
		// NOTE: sort the filters so a stable query is created
		// this is important for comparing history entries
		const activeFilters: FilterState[] = get.activeFilters();
		return getFilterSummary(activeFilters);
	}, 'luceneQuerySummary'),

	/** Return all filters holding a value, sorted by their ID */
	activeFilters: b.read(state => Object.values(state.filterStates).filter(f => !!f.lucene).sort((l, r) => l.id.localeCompare(r.id)), 'activeFilters'),
	/** Return activeFilters as associative map instead of array */
	activeFiltersMap: b.read(state => {
		const actives = get.activeFilters() as FilterState[];
		return mapReduce(actives, 'id');
	}, 'activeFiltersMap'),
};

const actions = {
	registerFilterGroup: b.commit((state, filterGroup: Group) => {
		if (state.filterGroups.find(g => g.id === filterGroup.id)) {
			console.warn(`Filter group ${filterGroup.id} already exists`);
			return;
		}
		state.filterGroups.push({
			id: filterGroup.id,
			fields: filterGroup.fields.filter(id => state.filterDefs[id] != null)
		});
	}, 'registerFilterGroup'),

	registerFilter: b.commit((state, {filter, insertBefore}: {
		/** Filter definition, with a legacy groupId */
		filter: RemoveProperties<FilterDefinition, 'isMetadataField'>&{groupId?: string};
		/** Optional: ID of another filter in this group before which to insert this filter, if omitted, the filter is appended at the end. */
		insertBefore?: string;
	}) => {
		if (state.filterDefs[filter.id]) {
			console.warn(`Filter ${filter.id} already exists`);
			return;
		}

		if (filter.groupId) {
			if (!state.filterGroups.find(g => g.id === filter.groupId)) {
				actions.registerFilterGroup({
					fields: [],
					id: filter.groupId,
				});
			}
			const group = state.filterGroups.find(g => g.id === filter.groupId)!;
			const index = insertBefore != null ? group.fields.indexOf(insertBefore) : -1;
			group.fields.splice(index !== -1 ? index : group.fields.length, 0, filter.id);
		}

		Vue.set<FilterDefinition>(state.filterDefs, filter.id, {
			componentName: filter.componentName,
			description: filter.description,
			displayName: filter.displayName,
			id: filter.id,
			isMetadataField: !!CorpusModule.getState().metadataFields[filter.id],
			metadata: filter.metadata
		});
		Vue.set<FilterState>(state.filterStates, filter.id, {
			id: filter.id,
			lucene: null,
			summary: null,
			value: null
		});
	}, 'registerFilter'),

	filter: b.commit((state, {id, lucene, summary, value}: FilterState) => {
		const f = state.filterStates[id!];
		f.lucene = lucene || null;
		f.summary = summary || null;
		f.value = value != null ? value : null;
	}, 'filter'),
	filterValue: b.commit((state, {id, value}: Pick<FullFilterState, 'id'|'value'>) => state.filterStates[id].value = value != null ? value : null, 'filter_value'),
	filterLucene: b.commit((state, {id, lucene}: Pick<FullFilterState, 'id'|'lucene'>) => state.filterStates[id].lucene = lucene || null, 'filter_lucene'),
	filterSummary: b.commit((state, {id, summary}: Pick<FullFilterState, 'id'|'summary'>) => state.filterStates[id].summary = summary || null, 'filter_summary'),
	reset: b.commit(state => Object.values(state.filterStates).forEach(f => f.value = f.summary = f.lucene = null), 'filter_reset'),

	replace: b.commit((state, payload: ModuleRootState['filterStates']) => {
		actions.reset();
		Object.values(payload).forEach(actions.filter);
	}, 'replace'),
};

const init = () => {
	// Take care to copy the order of metadatagroups and their fields here!
	CorpusModule.get.metadataGroups().forEach(g => actions.registerFilterGroup({
		fields: [],
		id: g.name
	}));
	CorpusModule.get.allMetadataFields().forEach(f => {
		let componentName;
		let metadata: any;
		switch (f.uiType) {
			case 'checkbox':
				componentName = 'filter-checkbox';
				metadata = f.values || [];
				break;
			case 'combobox':
				componentName = 'filter-autocomplete';
				metadata = paths.autocompleteMetadata(CorpusModule.getState().id, f.id);
				break;
			case 'radio'   :
				componentName = 'filter-radio';
				metadata = f.values || [];
				break;
			case 'range'   :
				componentName = 'filter-range';
				metadata = undefined;
				break;
			case 'select'  :
				componentName = 'filter-select';
				metadata = f.values || [];
				break;
			case 'text'    :
			default        :
				componentName = 'filter-text';
				metadata = undefined;
				break;
		}

		actions.registerFilter({
			filter: {
				componentName,
				description: f.description,
				displayName: f.displayName,
				groupId: f.groupId,
				id: f.id,
				metadata,
			}
		});
	});

	debugLog('Finished initializing filter module state shape');
};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
};
