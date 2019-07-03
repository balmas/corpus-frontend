<template>
	<div :title="id" class="form-group propertyfield" :id="definition.id"> <!-- behaves as .row when in .form-horizontal so .row may be omitted -->

		<label :for="inputId" class="col-xs-12 col-md-3" :title="definition.description || undefined">{{definition.displayName}}</label>
		<div class="col-xs-12 col-md-9">
			<input
				type="text"
				class="form-control"

				:id="inputId"
				:name="inputId"
				:placeholder="definition.displayName"
				:dir="textDirection"
				:disabled="lexiconValue"

				:value="lexiconValue ? lexiconValue : value"
				@input="lemma$.next($event.target.value); e_input($event.target.value);"
			/>
			<SelectPicker
				multiple
				resettable

				:placeholder="definition.displayName"
				:title="definition.description"
				:dir="textDirection"

				:loading="suggestions == null"
				:options="suggestions || []"

				v-model="selectedWordforms"
			/>

			<!-- <div v-if="metadata.caseSensitive" class="checkbox">
				<label :for="caseInputId">
					<input
						type="checkbox"

						:id="caseInputId"
						:name="caseInputId"
						:checked="value.caseSensitive"

						@change="e_input({value: value.value, caseSensitive: $event.target.checked})"
					>Case and diacritics sensitive</label>
			</div> -->
		</div>
	</div>
</template>

<script lang="ts">
import BaseAnnotationEditor, { SimpleCqlToken } from '@/components/annotations/Annotation';
import SelectPicker from '@/components/SelectPicker.vue';

import { escapeLucene, MapOf, unescapeLucene, regexToWildcard, wildcardToRegex, escapeRegex, unescapeRegex } from '@/utils';
import { FilterValue } from '@/types/apptypes';
import { AnnotationEditorDefinition } from '@/store/search/form/annotations';
import { Token, BinaryOp, Attribute } from '@/utils/cqlparser';
import { debugLog } from '@/utils/debug';
import * as Observable from 'rxjs';
import { map, switchMap, debounce, debounceTime, materialize, catchError, mapTo, tap, distinctUntilChanged } from 'rxjs/operators';
import Axios from 'axios';

type Metadata = {
	annotationId: string;
};

type LexiconParams = {
	database: string;
	lemma: string;
	case_sensitive: boolean;
	/** only one pos per query supported */
	pos?: string;
	/** Return split part of speech tags in the lexicon service? */
	split?: boolean;

	dataset?: string;
	year_from?: string; // format to be determined (just yyyy?)
	year_to?: string;
	tweaked_queries?: boolean;
	lemma_provenance?: string;
	paradigm_provenance?: any; // not sure what this is?
};

const config = {
	lexiconUrl: `http://sk.taalbanknederlands.inl.nl/LexiconService/lexicon/get_wordforms_from_lemma`,
	database: `mnwlex`,
	case_sensitive: false,
};

const pos$ = new Observable.Subject<string>();
const lemma$ = new Observable.Subject<string>().pipe(debounceTime(500));

const mapToSuggestions = Observable.pipe(

);

export default BaseAnnotationEditor.extend({
	components: { SelectPicker },
	props: {
		value: {
			type: String,
			required: true,
			default: ''
		},
	},
	data: () => ({
		lemma$: new Observable.BehaviorSubject<string>(''),
		pos$: new Observable.BehaviorSubject<string>(''),

		subscriptions: [] as Observable.Subscription[],
		suggestions: null as string[]|null,

		selectedWordforms: [] as string[]
	}),
	computed: {
		metadata(): Metadata { return this.definition.metadata as Metadata; },
		annotationId(): string { return this.metadata.annotationId; },
		cql(): string|string[]|null {
			/**
			 * How do we want to do this?
			 * we have 4 modes:
			 *
			 * single token, from input
			 * 		split on whitespace outside quotes, join using |
			 * single token, from list
			 * 		escape values, join using |
			 *
			 * multi token, from input
			 * 		split on whitespace outside quotes, create array
			 * multi token, from list
			 * 		escape values, join using |
			 */

			if (this.selectedWordforms && this.selectedWordforms.length) {
				return `${this.annotationId}="${this.selectedWordforms.map(escapeRegex).join('|')}"`;
			}

			const value = (this.value as string).trim();
			if (!value) {
				return null;
			}

			const resultParts = value
			.split(/"/)
			.flatMap((v, i) => {
				if (!v) {
					return [];
				}
				const inQuotes = (i % 2) !== 0;
				if (inQuotes) {
					// Keep value together including any contained whitespace contained therein
					return wildcardToRegex(v);
				} else {
					// Split value on whitespace, escape parts individually and remove empty strings (splitting artifacts)
					return v.split(/\s+/).filter(s => !!s).map(wildcardToRegex);
				}
			});

			// Now we have our value split on whitespace and escaped
			// debugLog('recalculated cql for annotation '+this.id);
			if (!resultParts.length) {
				return null;
			}
			if (this.outputMultipleTokens) { // Only supported for the textual input, lexicon values are always OR'ed
				return resultParts.map(v => `${this.annotationId}="${v}"`);
			} else {
				return `${this.annotationId}="${resultParts.join('|')}"`;
			}
		},
		lexiconValue(): string|null {
			return this.selectedWordforms && this.selectedWordforms.length ? this.selectedWordforms.join('|') : null;
		}
	},
	methods: {
		decodeInitialState(cql: SimpleCqlToken[], ast: Token[]): string|undefined {
			const stripCase = (value: string) => value.replace(/^\(\?-?[ic]\)/, '');

			if (!this.outputMultipleTokens) {
				cql = cql.slice(0, 1);
			}

			while (cql.length && !cql[cql.length-1][this.annotationId]) {
				cql.pop();
			}

			return cql.map((tok, index) => {
				const values = tok[this.annotationId];
				return values ? values.map(v => regexToWildcard(stripCase(v))).map(v => v.match('/\s+/') ? `"${v}"` : v).join('|') : '*';
			}).join(' ');
		},
		// onInput(input: string) { this.lemma$.next(input); },
		onPosChange(input: string) { this.pos$.next(input); },
		// onSuggestionSelected(suggestion: string) { this.}
	},
	created() {
		const input$ = Observable.combineLatest(this.lemma$, this.pos$);
		const suggestions$ = input$.pipe(
			debounceTime(500),
			// tap(([lemma, pos]) => console.log(`getting suggestions... lemma '${lemma}' pos '${pos}'`)),
			switchMap<[string, string], string[]>(([lemma, pos]: [string, string]) => {
				if (!lemma) {
					return Observable.of([] as string[]);
				}

				return Observable.from(
					Axios.get<{
						message: string;
						wordforms_list: Array<{
							/** Usually empty? */
							query_lemma_id: string;
							/** Input lemma */
							query_word: string;
							/** Input POS */
							query_pos: string;
							/** Yay */
							found_wordforms: string[];
						}>
					}>(config.lexiconUrl, {
						params: {
							database: config.database,
							lemma,
							pos: pos || undefined,
							case_sensitive: false,
						} as LexiconParams
					})
				)
				.pipe(
					map(v => {
						return v.data.wordforms_list.flatMap(l => l.found_wordforms);
					}),
					catchError(e => {
						// tslint:disable-next-line
						console.warn(`Error retrieving lexicon suggestions`, e);
						return [];
					}),
				);
			}),
			// tap(v => console.log('received suggestions...', v)),
		);

		const results$ = Observable.merge(
			input$.pipe(mapTo(null)),
			suggestions$
		).pipe(
			distinctUntilChanged()
		);

		this.subscriptions.push(
			results$.subscribe(r => {
			this.suggestions = r;
			// console.log('got suggestions in subscribe handler', r);
		}));
	},
	destroyed() {
		this.subscriptions.forEach(s => s.unsubscribe());
	}

});
</script>

<style lang="scss">

</style>