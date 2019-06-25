/**
 * Contains the current ui state for the simple/extended/advanced/expert query editors.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import Vue from 'vue';
import { getStoreBuilder } from 'vuex-typex';
import cloneDeep from 'clone-deep';

import { RootState } from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as AnnotationStore from '@/store/search/form/annotations';

import { debugLog } from '@/utils/debug';

import { AnnotationEditorInstance } from '@/store/search/form/annotations';
import { mapReduce } from '@/utils';

type ModuleRootState = {
	simple: AnnotationEditorInstance|null;
	extended: {
		annotationEditors: {
			[annotationEditorId: string]: AnnotationEditorInstance;
		};
		within: string|null;
		splitBatch: boolean;
	},
	advanced: string|null;
	expert: string|null;
};

type FullModuleRootState = ModuleRootState&{
	extended: ModuleRootState['extended']&{
		editorGroups: {
			[groupId: string]: {
				groupId: string;
				editorIds: string[];
			}
		};
	}
}

// There are three levels of state initialization
// First: the basic state shape (this)
// Then: the basic state shape with the appropriate annotation and filters created
// Finally: the values initialized from the page's url on first load.
const defaults: FullModuleRootState = {
	// placeholder until initialization
	simple: null,
	extended: {
		annotationEditors: {},
		editorGroups: {},
		within: null,
		splitBatch: false,
	},
	advanced: null,
	expert: null,
};

const namespace = 'patterns';
const b = getStoreBuilder<RootState>().module<FullModuleRootState>(namespace, cloneDeep(defaults));

const getState = b.state();

const get = {
	simple: {
		fullEditorInstance: b.read(state => state.simple ? {...state.simple!, ...AnnotationStore.getState()[state.simple!.id]} : null, 'simple_fullEditorInstance')
	},
	/** Last submitted properties, these are already filtered to remove empty values, etc */
	activeAnnotationEditors: b.read(state => Object.values(state.extended.annotationEditors).filter(e => !!e.value), 'activeAnnotationEditors'),
	activeAnnotatinEditorMap: b.read(state => {
		const temp: AnnotationEditorInstance[] = get.activeAnnotationEditors();
		return mapReduce(temp, 'id');
	}, 'activeAnnotationEditorMap'),
	annotationEditorGroups: b.read<Array<{
		groupId: string;
		editorIds: string[];
		editors: AnnotationStore.FullAnnotationEditorInstance[];
	}>>(state => Object.values(state.extended.editorGroups).map(group => ({
		...group,
		editors: group.editorIds.map(id => ({...state.extended.annotationEditors[id], ...AnnotationStore.getState()[id]}))
	})), 'annotationEditorGroups')
};

// const privateActions = {
// };

const actions = {
	simple: {
		annotationEditorId: b.commit((state, id: string) => {
			if (!AnnotationStore.getState()[id]) {
				// tslint:disable-next-line
				console.warn(`Trying to set annotation editor for simple search to ${id} but it doesn't exist!`);
				return;
			}

			state.simple = {
				cql: null,
				id,
				stringvalue: [],
				value: null,
			};
		}, 'annotation_simple_set_id'),
		annotationEditorValue: b.commit((state, value: AnnotationEditorInstance['cql']) => state.simple!.value = value != null ? value : null, 'annotation_value_simple') as (value: AnnotationEditorInstance['value']) => void,
		annotationEditorCql: b.commit((state, cql: AnnotationEditorInstance['cql']) => state.simple!.cql = cql || null, 'annotation_cql_simple'),
	},
	extended: {
		// annotation: b.commit((state, {id, ...rest}: Partial<AnnotationValue>&{id: string}) => {
		// 	// Never overwrite annotatedFieldId or type, even when they're submitted through here.
		// 	const {type, ...safeValues} = rest;
		// 	Object.assign(state.extended.annotationValues[id], safeValues);
		// }, 'extended_annotation'),
		createAnnotationEditorInstance: b.commit((state, {id, groupId, insertBefore}: {id: string, groupId?: string, insertBefore?: string}) => {
			if (groupId) {
				const group = state.extended.editorGroups[groupId];
				if (group) {
					const index = insertBefore != null ? group.editorIds.indexOf(insertBefore) : -1;
					group.editorIds.splice(index !== -1 ? index : group.editorIds.length, 0, id);
				} else {
					state.extended.editorGroups[groupId] = {
						groupId,
						editorIds: [id]
					};
				}
			}

			Vue.set<AnnotationEditorInstance>(state.extended.annotationEditors, id, {
				cql: null,
				id,
				stringvalue: [],
				value: null
			});
		}, 'annotation_init'),

		annotationEditor: b.commit((state, {id, cql, value, stringvalue}: AnnotationEditorInstance) => {
			const f = state.extended.annotationEditors[id];
			f.cql = cql || null;
			f.value = value != null ? value : null;
			f.stringvalue = stringvalue;
		}, 'filter'),
		annotationEditorValue: b.commit((state, {id, value}: Pick<AnnotationEditorInstance, 'id'|'value'>) => state.extended.annotationEditors[id].value = value != null ? value : null, 'annotation_value'),
		annotationEditorCql: b.commit((state, {id, cql}: Pick<AnnotationEditorInstance, 'id'|'cql'>) => state.extended.annotationEditors[id].cql = cql || null, 'annotation_cql'),
		annotationEditorStringValue: b.commit((state, {id, stringvalue}: Pick<AnnotationEditorInstance, 'id'|'stringvalue'>) => state.extended.annotationEditors[id].stringvalue = stringvalue, 'annotation_stringvalue'),

		within: b.commit((state, payload: string|null) => state.extended.within = payload, 'extended_within'),
		splitBatch: b.commit((state, payload: boolean) => state.extended.splitBatch = payload, 'extended_split_batch'),

		reset: b.commit(state => {
			Object.values(state.extended.annotationEditors).forEach(annot => {
				annot.value = annot.cql = null;
				annot.stringvalue = [];
			});
			state.extended.within = null;
			state.extended.splitBatch = false;
		}, 'extended_reset'),
	},
	advanced: b.commit((state, payload: string|null) =>state.advanced = payload, 'advanced'),
	expert: b.commit((state, payload: string|null) => state.expert = payload, 'expert'),

	reset: b.commit(state => {
		// state.simple = null;
		actions.extended.reset();
		state.advanced = null;
		state.expert = null;
	}, 'reset'),

	replace: b.commit((state, payload: ModuleRootState) => {
		actions.simple.annotationEditorCql(payload.simple!.cql);
		actions.simple.annotationEditorValue(payload.simple!.value);
		actions.advanced(payload.advanced);
		actions.expert(payload.expert);
		actions.extended.reset();
		actions.extended.within(payload.extended.within);
		actions.extended.splitBatch(payload.extended.splitBatch);
		Object.values(payload.extended.annotationEditors).forEach(actions.extended.annotationEditor);
	}, 'replace'),
};

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = () => {
	CorpusStore.get.annotations()
	.forEach(annot => {
		debugger;
		actions.extended.createAnnotationEditorInstance({
			groupId: annot.groupId,
			id: annot.id
		})
	});

	actions.simple.annotationEditorId(CorpusStore.get.firstMainAnnotation().id);
	debugLog('Finished initializing pattern module state shape');
};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults
};
