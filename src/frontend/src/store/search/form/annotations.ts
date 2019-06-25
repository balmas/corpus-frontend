/**
 * This module contains a single entry for every metadata field in this corpus.
 * It contains the current ui state for frequency list form.
 *
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */
import Vue from 'vue';
import cloneDeep from 'clone-deep';
import { getStoreBuilder } from 'vuex-typex';

import { RootState } from '@/store/search/';
import * as CorpusModule from '@/store/search/corpus';

import { FilterDefinition } from '@/types/apptypes';

import { debugLog } from '@/utils/debug';
import { paths } from '@/api';
import { RemoveProperties } from '@/types/helpers';

export type AnnotationEditorDefinition = RemoveProperties<FilterDefinition, 'groupId'>;

export type AnnotationEditorInstance = {
	id: string;
	/**
	 * Single string === use for every position in the query,
	 * string[] === split values over multiple tokens based on index.
	 * Split batch queries will also split over every entry in the array,
	 * will reuse the entire value for every split in the array.
	 */
	cql: string|string[]|null;

	/** Raw internal value for the component. null === default value, to be substituted by component itself. */
	value: any|null;

	/** TODO: used to transfer state from one instance to another of unknown implementation */
	stringvalue: string[];
};

export type FullAnnotationEditorInstance = AnnotationEditorDefinition&AnnotationEditorInstance;

// export type FullAnnotationState = FilterDefinition&AnnotationEditorValue;

type ModuleRootState = {
	[annotationId: string]: AnnotationEditorDefinition;
	// groups defined where they are needed - e.g. pattern store
};

type ExternalModuleRootState = ModuleRootState['annotations'];

/** Populated on store initialization and afterwards */
const initialState: ModuleRootState = {
	// nothing!
};

const namespace = 'annotations';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, Object.assign({}, initialState));
const getState = b.state();

const get = {
	// cqlQuery: b.read(state => {
	// 	// NOTE: sort the filters so a stable query is created
	// 	// this is important for comparing history entries
	// 	const activeFilters: FullFilterState[] = get.activeFilters().concat().sort((l, r) => l.id.localeCompare(r.id));
	// 	return getFilterString(activeFilters);
	// } , 'luceneQuery'),

	// /** Return all filters holding a value */
	// activeAnnotations: b.read(state => Object.values(state).filter(f => !!f.cql), 'activeAnnotations'),
	// /** Return activeAnnotations as associative map instead of array */
	// activeAnnotationMap: b.read(state => {
	// 	const activeAnnotations: FullAnnotationState[] = get.activeAnnotations();
	// 	return mapReduce(activeAnnotations, 'id');
	// }, 'activeAnnotationsMap'),
};

const actions = {
	// registerFilterGroup: b.commit((state, filterGroup: {groupId: string, filterIds: string[]}) => {
	// 	if (filterGroup.groupId in state.filterGroups) {
	// 		// tslint:disable-next-line
	// 		console.warn(`Filter group ${filterGroup.groupId} already exists`);
	// 		return;
	// 	}

	// 	Vue.set<ModuleRootState['filterGroups'][string]>(state.filterGroups, filterGroup.groupId, {
	// 		groupId: filterGroup.groupId,
	// 		filterIds: filterGroup.filterIds.filter(id => state.filters[id] != null),
	// 	});
	// }, 'registerFilterGroup'),

	registerAnnotationEditor: b.commit((state, annot: AnnotationEditorDefinition) => {
		if (annot.id in state) {
			// tslint:disable-next-line
			console.warn(`Annotation ${annot.id} already exists`);
			return;
		}

		Vue.set<AnnotationEditorDefinition>(state, annot.id, cloneDeep(annot));
	}, 'registerAnnotationEditor'),

	// filter: b.commit((state, {id, lucene, value, summary}: Pick<FullFilterState, 'id'|'lucene'|'value'|'summary'>) => {
	// 	const f = state.filters[id];
	// 	f.lucene = lucene || null;
	// 	f.summary = summary || null;
	// 	f.value = value != null ? value : null;
	// }, 'filter'),
	// filterValue: b.commit((state, {id, value}: Pick<FullFilterState, 'id'|'value'>) => state.filters[id].value = value != null ? value : null, 'filter_value'),
	// filterLucene: b.commit((state, {id, lucene}: Pick<FullFilterState, 'id'|'lucene'>) => state.filters[id].lucene = lucene || null, 'filter_lucene'),
	// filterSummary: b.commit((state, {id, summary}: Pick<FullFilterState, 'id'|'summary'>) => state.filters[id].summary = summary || null, 'filter_summary'),
	// reset: b.commit(state => Object.values(state.filters).forEach(f => f.value = f.summary = f.lucene = null), 'filter_reset'),

	// replace: b.commit((state, payload: ExternalModuleRootState) => {
	// 	actions.reset();
	// 	Object.values(payload).forEach(actions.filter);
	// }, 'replace'),
};

const init = () => {
	Object.values(CorpusModule.getState().annotatedFields)
	.flatMap(f => Object.values(f.annotations))
	.forEach(annot => {
		let componentName;
		let metadata: any;
		switch (annot.uiType) {
			// case 'combobox':
			// 	componentName = 'annotation-autocomplete';
			// 	metadata = paths.autocompleteAnnotation(CorpusModule.getState().id, annot.annotatedFieldId, annot.id);
			// 	break;
			// case 'select'  :
			// 	componentName = 'annotation-select';
			// 	metadata = annot.values || [];
			// 	break;
			case 'text'    :
			default        :
				componentName = 'annotation-text';
				metadata = {
					caseSensitive: annot.caseSensitive
				};
				break;
		}

		actions.registerAnnotationEditor({
			componentName,
			description: annot.description,
			displayName: annot.displayName,
			id: annot.id,
			metadata,
		});
	});

	debugLog('Finished initializing annotation module state shape');
};

export {
	ExternalModuleRootState as ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
};
