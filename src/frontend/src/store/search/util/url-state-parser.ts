import Vue from 'vue';

import memoize from 'memoize-decorator';

import BaseUrlStateParser from '@/store/util/url-state-parser-base';
import LuceneQueryParser from 'lucene-query-parser';

import { mapReduce, MapOf, regexToWildcard, unescapeRegex, wildcardToRegex } from '@/utils';
import parseCql, {Attribute, BinaryOp} from '@/utils/cqlparser';
import parseLucene from '@/utils/luceneparser';
import { debugLog } from '@/utils/debug';

import * as CorpusModule from '@/store/search/corpus';
import * as HistoryModule from '@/store/search/history';
import * as TagsetModule from '@/store/search/tagset';

// Form
import * as FilterModule from '@/store/search/form/filters';
import * as AnnotationModule from '@/store/search/form/annotations';
import * as InterfaceModule from '@/store/search/form/interface';
import * as PatternModule from '@/store/search/form/patterns';
import * as ExploreModule from '@/store/search/form/explore';
import * as GapModule from '@/store/search/form/gap';

// Results
import * as ResultsManager from '@/store/search/results';
import * as DocResultsModule from '@/store/search/results/docs';
import * as GlobalResultsModule from '@/store/search/results/global';
import * as HitResultsModule from '@/store/search/results/hits';

import { FilterValue } from '@/types/apptypes';

import BaseFilter from '@/components/filters/Filter';
import baseAnnotationEditor, { SimpleCqlToken } from '@/components/annotations/Annotation';
import { Token } from '@/utils/cqlparser';
import cloneDeep from 'clone-deep';

/**
 * Decode the current url into a valid page state configuration.
 * Keep everything private except the getters
 */
export default class UrlStateParser extends BaseUrlStateParser<HistoryModule.HistoryEntry> {
	/**
	 * MetadataFilters here are the interface components to filter a query by document metadata.
	 * Because these can be fairly complex components, we have decided to implement decoding of the query in the Vue components.
	 * So in order to decode the query, we need knowledge of which filters are configured.
	 * This is done by the FilterModule, so we need that info here.
	 */
	constructor(private registeredMetadataFilters: FilterModule.ModuleRootState, uri?: uri.URI) {
		super(uri);
	}

	@memoize
	public get(): HistoryModule.HistoryEntry {
		return {
			explore: this.explore,
			filters: this.filters,
			interface: this.interface,
			patterns: this.patterns,
			gap: this.gap,

			docs: this.docs,
			global: this.global,
			hits: this.hits,

			// submitted query not parsed from url: is restored from rest of state later.
		};
	}

	@memoize
	private get explore(): ExploreModule.ModuleRootState {
		return {
			frequency: this.frequencies || ExploreModule.defaults.frequency,
			ngram: this.ngrams || ExploreModule.defaults.ngram,
			corpora: this.corpora || ExploreModule.defaults.corpora,
		};
	}

	@memoize
	private get filters(): FilterModule.ModuleRootState {
		const luceneString = this.getString('filter', null, v=>v?v:null);
		if (luceneString == null) {
			return {};
		}

		try {
			const luceneParsedThing = LuceneQueryParser.parse(luceneString);
			const parsedQuery: MapOf<FilterValue> = mapReduce(parseLucene(luceneString), 'id');
			const parsedQuery2: FilterModule.FullFilterState[] = Object.values(this.registeredMetadataFilters).map(filter => {
				const vueComponent = Vue.component(filter.componentName) as typeof BaseFilter;
				if (!vueComponent) {
					// tslint:disable-next-line
					console.warn(`Filter ${filter.id} defines its vue component as ${filter.componentName} but it does not exist! (have you registered it properly with vue?)`);
					return filter;
				}

				const vueComponentInstance = new vueComponent({
					propsData: {
						// don't set a null value, allow the component to set this prop's default value (if configured).
						// or it may throw errors when running compute methods.
						value: undefined,
						textDirection: CorpusModule.getState().textDirection,
						definition: filter,
					},
				});

				const componentValue = vueComponentInstance.decodeInitialState(parsedQuery, luceneParsedThing);
				const storeValue: FilterModule.FilterState = {
					value: componentValue != null ? componentValue : undefined,
					summary: null,
					lucene: null
				};
				if (componentValue != null) { // don't overwrite default value
					Vue.set((vueComponentInstance as any)._props, 'value', componentValue);
					storeValue.summary = vueComponentInstance.luceneQuerySummary;
					storeValue.lucene = vueComponentInstance.luceneQuery;
				}
				return {
					...filter,
					...storeValue
				};
			});

			return mapReduce(parsedQuery2, 'id');
		} catch (error) {
			debugLog('Cannot decode lucene query ', luceneString, error);
			return {};
		}
	}

	/**
	 * Return the frequency form state, if the query fits in there in its entirity.
	 * Null is returned otherwise.
	 */
	@memoize
	private get frequencies(): null|ExploreModule.ModuleRootState['frequency'] {
		if (this.expertPattern !== '[]' || this._groups.length !== 1 || this.groupBy.length !== 1) {
			return null;
		}

		const group = this.groupBy[0];
		if (!group.startsWith('hit:')) {
			return null;
		}

		const annotationId = group.substring(4);
		if (!CorpusModule.get.annotationDisplayNames().hasOwnProperty(annotationId)) {
			return null;
		}

		return { annotationId };
	}

	@memoize
	private get interface(): InterfaceModule.ModuleRootState {
		try {
			const uiStateFromUrl: Partial<InterfaceModule.ModuleRootState>|null = JSON.parse(this.getString('interface', null, v => v.startsWith('{')?v:null)!);
			if (!uiStateFromUrl) {
				throw new Error('No url ui state, falling back to determining from rest of parameters.');
			}
			return {
				...InterfaceModule.defaults,
				...uiStateFromUrl,
				// This is not contained in the 'interface' query parameters, but in the path segments of the url.
				// hence decode seperately.
				viewedResults: this.viewedResults
			};
		} catch (e) {
			// Can't parse from url, instead determine the best state based on other parameters.
			const ui = InterfaceModule.defaults;

			ui.patternMode = this.expertPattern ? 'expert' : 'simple';
			// Open any results immediately?
			ui.viewedResults = this.viewedResults;

			return ui;
		}
	}

	@memoize
	private get gap(): GapModule.ModuleRootState {
		const value = this.getString('pattgapdata');
		return value ? { value } : GapModule.defaults;
	}

	@memoize
	private get viewedResults(): 'hits'|'docs'|null {
		const path = this.paths.length ? this.paths[this.paths.length-1].toLowerCase() : null;
		if (path !== 'hits' && path !== 'docs') {
			return null;
		} else {
			return path;
		}
	}

	/**
	 * Return the ngram form state, if the query fits in there in its entirity.
	 * Null is returned otherwise.
	 */
	@memoize
	private get corpora(): null|ExploreModule.ModuleRootState['corpora'] {
		if (this.viewedResults !== 'docs') {
			return null;
		}

		if (this.groupByAdvanced.length !== 0 || this.groupBy.length === 0) {
			return null;
		}

		if (this.expertPattern) {
			return null;
		}

		return {
			groupBy: this.groupBy[0],
			groupDisplayMode: this.hitsOrDocs('docs').groupDisplayMode || ExploreModule.defaults.corpora.groupDisplayMode
		};
	}

	/**
	 * Return the ngram form state, if the query fits in there in its entirity.
	 * Null is returned otherwise.
	 */
	@memoize
	private get ngrams(): null|ExploreModule.ModuleRootState['ngram'] {
		if (this.groupByAdvanced.length || this.groupBy.length === 0) {
			return null;
		}

		const group = this.groupBy[0];
		if (!group.startsWith('hit:')) {
			return null;
		}

		const groupAnnotationId = group.substring(4);
		if (!CorpusModule.get.annotationDisplayNames().hasOwnProperty(groupAnnotationId)) {
			return null;
		}

		const cql = this._parsedCql;
		const simplecql = this._simplifiedQuery;
		// all tokens need to  [annotation="value"] tokens.
		if (!cql || !simplecql || cql.within) {
			return null;
		}

		const availableAnnotationEditors = AnnotationModule.getState();
		const ngramEditorIds = JSON.parse(this.getString('ngramEditorIds', 'null')!);
		if (!ngramEditorIds || !Array.isArray(ngramEditorIds)) {
			return null;
		}
		for (const id of ngramEditorIds) {
			if (!availableAnnotationEditors[id]) {
				console.warn(`Trying to parse ngram created with editor ${id}, but it doesn't exist, are you registering it in custom js?`);
				return null;
			}
		}

		const parseUntil = Math.min(ngramEditorIds.length, simplecql.length, cql.tokens.length);
		if (parseUntil === 0) {
			return null;
		}
		const editorValues: AnnotationModule.AnnotationEditorInstance[] = []
		for (let i = 0; i < parseUntil; ++i) {
			editorValues.push(this._annotationValue(availableAnnotationEditors[ngramEditorIds[i]], false, [simplecql[i]], [cql.tokens[i]]))
		}

		return {
			groupAnnotationId,
			maxSize: ExploreModule.defaults.ngram.maxSize,
			size: editorValues.length,
			tokens: editorValues,
		};
	}

	@memoize
	private get patterns(): PatternModule.ModuleRootState {
		return {
			simple: this.simplePattern,
			extended: this.extendedPattern,
			advanced: this.advancedPattern,
			expert: this.expertPattern,
		};
	}

	private get hits(): HitResultsModule.ModuleRootState {
		return this.hitsOrDocs('hits');
	}

	private get docs(): DocResultsModule.ModuleRootState {
		return this.hitsOrDocs('docs');
	}

	@memoize
	private get global(): GlobalResultsModule.ModuleRootState {
		return {
			pageSize: this.pageSize,
			sampleMode: this.sampleMode,
			sampleSeed: this.sampleSeed,
			sampleSize: this.sampleSize,
			wordsAroundHit: this.wordsAroundHit
		};
	}

	@memoize
	private get pageSize(): number {
		return this.getNumber('number', GlobalResultsModule.defaults.pageSize, v => [20,50,100,200].includes(v) ? v : GlobalResultsModule.defaults.pageSize)!;
	}

	/**
	 * Decode the query ignoring all of the combining operators.
	 * Just extract all values for all annotations and stick them in arrays.
	 * Also ignores all metadata about tokens, such as repeating clauses and such.
	 */
	@memoize
	private get _simplifiedQuery(): null|SimpleCqlToken[] {
		debugger;
		const parsedCql = this._parsedCql;
		if (!parsedCql) {
			return null;
		}

		return parsedCql.tokens.map(t => {
			const context: MapOf<string[]> = {};

			const stack = [t.expression!];
			let cur: (typeof stack)[number];
			// tslint:disable-next-line
			while (cur = stack.shift()!) {
				if (cur.type === 'binaryOp') {
					stack.push(cur.left, cur.right);
				} else {
					const value = cur.value;
					context[cur.name] ? context[cur.name].push(cur.value) : context[cur.name] = [value];
				}
			}
			return context;
		});
	}

	private _annotationValue(editorDefinition: AnnotationModule.AnnotationEditorDefinition, parseMultipleTokens: boolean, simpleTokens: SimpleCqlToken[], tokens: Token[]): AnnotationModule.AnnotationEditorInstance {
		const {componentName, id} = editorDefinition;
		const vueComponent = Vue.component(componentName) as typeof baseAnnotationEditor;

		if (!vueComponent) {
			// tslint:disable-next-line
			console.warn(`Simple annotation ${id} defines its vue component as ${componentName} but it does not exist! (have you registered it properly with vue?)`);
			return {
				cql: null,
				id,
				value: null
			};
		}

		const vueComponentInstance = new vueComponent({
			propsData: {
				// don't set a null value, allow the component to set this prop's default value (if configured).
				// or it may throw errors when running computed methods.
				value: undefined,
				textDirection: CorpusModule.getState().textDirection,
				definition: editorDefinition,
				outputMultipleTokens: parseMultipleTokens
			},
		});

		const componentValue = tokens ? vueComponentInstance.decodeInitialState(cloneDeep(simpleTokens), cloneDeep(tokens)) : null;
		const storeValue: AnnotationModule.AnnotationEditorInstance = {
			cql: null,
			id,
			value: componentValue ? componentValue : null // take care not to store undefined or we lose store reactivity!
		};

		if (componentValue != null) { // don't overwrite default value
			Vue.set((vueComponentInstance as any)._props, 'value', componentValue);
			storeValue.cql = vueComponentInstance.cql;
		}
		return storeValue;
	}

	@memoize
	private get annotationValues(): MapOf<AnnotationModule.AnnotationEditorInstance> {
		const editorDefs: MapOf<AnnotationModule.AnnotationEditorDefinition> = AnnotationModule.getState();
		const editorIdsInUse = Object.keys(PatternModule.getState().extended.annotationEditors);

		const simpleCqlTokens = this._simplifiedQuery;
		const cqlTokens = this._parsedCql ? this._parsedCql.tokens : null;

		if (simpleCqlTokens && cqlTokens) {
			const editorValues: AnnotationModule.AnnotationEditorInstance[] =
				editorIdsInUse
				.map(id => this._annotationValue(editorDefs[id], true, simpleCqlTokens, cqlTokens))
				.filter(decodedEditorState => decodedEditorState.value && decodedEditorState.cql);

			debugger;
			return mapReduce(editorValues, 'id');
		} else {
			return {};
		}
	}

	@memoize
	private get simplePattern(): AnnotationModule.AnnotationEditorInstance {
		const editorId = PatternModule.getState().simple!.id;
		const editorDefinition = AnnotationModule.getState()[editorId];

		const simpleCqlTokens = this._simplifiedQuery;
		const cqlTokens = this._parsedCql ? this._parsedCql.tokens : null;

		return simpleCqlTokens && cqlTokens
			? this._annotationValue(editorDefinition, true, simpleCqlTokens, cqlTokens)
			: {
				id: editorId,
				cql: null,
				value: null
			};
	}

	@memoize
	private get extendedPattern(): PatternModule.ModuleRootState['extended'] {
		return {
			annotationEditors: this.annotationValues,
			within: this.within,
			// This is always false, it's just a checkbox that will split up the query when it's submitted, then untick itself
			splitBatch: false
		};
	}

	@memoize
	private get advancedPattern(): string|null {
		// If the pattern can't be parsed, the querybuilder can't use it either.
		return this._parsedCql ? this.expertPattern : null;
	}

	@memoize
	private get expertPattern(): string|null {
		return this.getString('patt', null, v=>v?v:null);
	}

	@memoize
	private get sampleMode(): 'count'|'percentage' {
		// If 'sample' exists we're in count mode, otherwise if 'samplenum' (and is valid), we're in percent mode
		// ('sample' also has precendence for the purposes of determining samplesize)
		if (this.getNumber('samplenum') != null) {
			return 'count';
		} else if (this.getNumber('sample', null, v => (v != null && (v >= 0 && v <=100)) ? v : null) != null) {
			return 'percentage';
		} else {
			return GlobalResultsModule.defaults.sampleMode;
		}
	}

	@memoize
	private get sampleSeed(): number|null {
		return this.getNumber('sampleseed', null);
	}

	@memoize
	private get sampleSize(): number|null {
		// Use 'sample' unless missing or not 0-100 (as it's percentage-based), then use 'samplenum'
		const sample = this.getNumber('sample', null, v => v != null && v >= 0 && v <= 100 ? v : null);
		return sample != null ? sample : this.getNumber('samplenum', null);
	}

	// TODO these might become dynamic in the future, then we need extra manual checking to see if the value is even supported in this corpus
	@memoize
	private get within(): string|null {
		return this._parsedCql ? this._parsedCql.within || null : null;
	}

	@memoize
	private get wordsAroundHit(): number|null {
		return this.getNumber('wordsaroundhit', null, v => v != null && v >= 0 && v <= 10 ? v : null);
	}

	/** Return the group variables unprocessed, including their case flags and context groups intact */
	@memoize
	private get _groups(): string[] {
		return this.getString('group', '')!
		.split(',')
		.map(g => g.trim())
		.filter(g => !!g);
	}

	@memoize
	private get groupBy(): string[] {
		return this._groups
		.filter(g => !g.startsWith('context:'))
		.map(g => g.replace(/\:[is]$/, '')); // strip case-sensitivity flag from value, is only visible in url
	}

	@memoize
	private get groupByAdvanced(): string[] {
		return this._groups
		.filter(g => g.startsWith('context:'));
	}

	@memoize
	private get caseSensitive(): boolean {
		const groups = this._groups
		.filter(g => !g.startsWith('context:'));

		return groups.length > 0 && groups.every(g => g.endsWith(':s'));
	}

	// No memoize - has parameters
	private hitsOrDocs(view: ResultsManager.ViewId): DocResultsModule.ModuleRootState { // they're the same anyway.
		if (this.viewedResults !== view) {
			return DocResultsModule.defaults;
		}

		return {
			groupBy: this.groupBy,
			groupByAdvanced: this.groupByAdvanced,
			caseSensitive: this.caseSensitive,
			sort: this.getString('sort', null, v => v?v:null),
			viewGroup: this.getString('viewgroup', undefined, v => (v && this._groups.length > 0)?v:null),
			page: this.getNumber('first', 0, v => Math.floor(Math.max(0, v)/this.pageSize)/* round down to nearest page containing the starting index */)!,
			groupDisplayMode: this.getString('groupDisplayMode', null, v => v?v:null),
		};
	}

	// ------------------------
	// Some intermediate values
	// ------------------------

	@memoize
	private get _parsedCql(): null|ReturnType<typeof parseCql> {
		try {
			const result = parseCql(this.expertPattern || '', CorpusModule.get.firstMainAnnotation().id);
			return result.tokens.length > 0 ? result : null;
		} catch (e) {
			return null; // meh, can't parse
		}
	}
}
