/**
 * Contains the current ui state for n-gram form.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */
import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';

import {RootState} from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus'; // Is initialized before we are.
import * as UIStore from '@/store/search/ui'; // Is initialized before we are.
import * as AnnotationStore from '@/store/search/form/annotations';
import { RemoveProperties } from '@/types/helpers';
// import {AnnotationValue} from '@/types/apptypes';

// type Token = AnnotationEditorInstance;

type ModuleRootState = {
	ngram: {
		maxSize: number;
		size: number;
		tokens: AnnotationStore.AnnotationEditorInstance[];
		groupAnnotationId: string;
	};

	frequency: {
		annotationId: string;
	};

	/** When the form is submitted this is copied to the DocsStore */
	corpora: {
		groupBy: string;
		groupDisplayMode: string;
	};
};

// NOTE: This state shape is invalid, we correct it on store initialization
const defaults: ModuleRootState = {
	ngram: {
		/** 1-indexed */
		maxSize: 5,
		/** 1-indexed */
		size: 5,
		get tokens() {
			const ret: ModuleRootState['ngram']['tokens'] = [];
			for (let i = 0; i < defaults.ngram.maxSize; ++i) {
				ret.push({
					id: defaults.ngram.groupAnnotationId,
					cql: null,
					stringvalue: [],
					value: null
				});
			}
			return ret;
		},
		get groupAnnotationId() { return UIStore.getState().explore.defaultAnnotationId; }
	},

	frequency: {
		get annotationId() { return UIStore.getState().explore.defaultAnnotationId; }
	},

	corpora: {
		get groupBy() { return `field:${UIStore.getState().explore.defaultMetadataFieldId}`; },
		// todo
		groupDisplayMode: 'table'
	}
};

const namespace = 'explore';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));
const getState = b.state();

const get = {
	ngram: {
		size: b.read(state => state.ngram.size, 'ngram_size'),
		maxSize: b.read(state => state.ngram.maxSize, 'ngram_maxSize'),
		tokens: b.read(state => state.ngram.tokens.map(t => ({...t, ...AnnotationStore.getState()[t.id]})), 'ngram_tokens'),
		groupAnnotationId: b.read(state => state.ngram.groupAnnotationId, 'ngram_groupAnnotationId'),

		groupBy: b.read(state => `hit:${state.ngram.groupAnnotationId}`, 'ngram_groupBy'),
		patternString: b.read(state => state.ngram.tokens
			.slice(0, state.ngram.size)
			.map(v => `[${Array.isArray(v.cql) ? v.cql.join(' | ') : v.cql || ''}]`)
			.join('')
		, 'ngram_patternString')
	},

	frequency: {
		annotationId: b.read(state => state.frequency.annotationId, 'frequency_annotationId'),
		patternString: b.read(() => '[]', 'frequency_patternString'), // always search for all tokens.
		groupBy: b.read(state => `hit:${state.frequency.annotationId}`, 'frequency_groupBy')
	},

	corpora: {
		groupBy: b.read(state => state.corpora.groupBy, 'corpora_groupBy'),
		groupDisplayMode: b.read(state => state.corpora.groupDisplayMode, 'corpora_groupDisplayMode'),
	}
};

const internalActions = {
	fixTokenArray: b.commit(state => {
		const {id} = CorpusStore.get.firstMainAnnotation();
		state.ngram.tokens = state.ngram.tokens.slice(0, state.ngram.maxSize);
		while (state.ngram.tokens.length < state.ngram.maxSize) {
			state.ngram.tokens.push({
				id,
				cql: null,
				stringvalue: [],
				value: null
			});
		}
	}, 'fixTokenArray')
};

const actions = {
	ngram: {
		size: b.commit((state, payload: number) => state.ngram.size = Math.min(state.ngram.maxSize, payload), 'ngram_size'),
		tokenType: b.commit((state, payload: {index: number, id: string}) => {
			if (payload.index < state.ngram.maxSize) {
				state.ngram.tokens[payload.index].id = payload.id;
				state.ngram.tokens[payload.index].value = null;
				state.ngram.tokens[payload.index].cql = null;
				// keep stringValue, that's how we (attempt to) transfer values from one editor to another.
			}
		}, 'ngram_type'),
		tokenValue: b.commit((state, payload: {index: number, value: Partial<RemoveProperties<AnnotationStore.AnnotationEditorInstance, 'id'>>}) => {
			if (payload.index < state.ngram.maxSize) {
				Object.assign(state.ngram.tokens[payload.index], payload.value);
			}
		}, 'ngram_value'),
		// tokenCql: b.commit((state, payload: { index: number, cql: string|string[] }) => {
		// 	if (payload.index < state.ngram.maxSize) {
		// 		state.ngram.tokens[payload.index].cql = payload.cql;
		// 	}
		// }, 'ngram_cql'),
		// tokenStringValue: b.commit((state, payload: {index: number, stringValue}))

		groupAnnotationId: b.commit((state, payload: string) => state.ngram.groupAnnotationId = payload, 'ngram_groupAnnotationId'),
		maxSize: b.commit((state, payload: number) => {
			state.ngram.size = Math.min(state.ngram.size, payload);
			state.ngram.tokens = state.ngram.tokens.slice(0, payload);
			internalActions.fixTokenArray();
		}, 'ngram_maxSize'),

		// stringify/parse required so we don't alias the default array
		reset: b.commit(state => Object.assign(state.ngram, cloneDeep(defaults.ngram)), 'ngram_reset'),

		replace: b.commit((state, payload: ModuleRootState['ngram']) => {
			Object.assign(state.ngram, payload);
			internalActions.fixTokenArray(); // for when new token array doesn't match maximum length
		}, 'ngram_replace')
	},

	frequency: {
		annotationId: b.commit((state, payload: string) => state.frequency.annotationId = payload, 'frequency_annotationId'),

		reset: b.commit(state => Object.assign(state.frequency, defaults.frequency) , 'frequency_reset'),
		replace: b.commit((state, payload: ModuleRootState['frequency']) => Object.assign(state.frequency, payload), 'frequency_replace'),
	},

	corpora: {
		groupBy: b.commit((state, payload: string) => state.corpora.groupBy = payload, 'corpora_groupBy'),
		groupDisplayMode: b.commit((state, payload: string) => state.corpora.groupDisplayMode = payload, 'corpora_groupDisplayMode'),

		reset: b.commit(state => Object.assign(state.corpora, defaults.corpora), 'corpora_reset'),
		replace: b.commit((state, payload: ModuleRootState['corpora']) => Object.assign(state.corpora, payload), 'corpora_replace'),
	},

	replace: b.commit((state, payload: ModuleRootState) => {
		actions.frequency.replace(payload.frequency);
		actions.ngram.replace(payload.ngram);
	}, 'replace'),
	reset: b.commit(state => Object.assign(state, cloneDeep(defaults)), 'reset'),
};

const init = () => {
	actions.reset();
};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults,
};
