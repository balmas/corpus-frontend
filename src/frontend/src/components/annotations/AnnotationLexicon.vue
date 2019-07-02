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

				:value="value.value"
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
import BaseAnnotationEditor from '@/components/annotations/Annotation';
import SelectPicker from '@/components/SelectPicker.vue';

import { escapeLucene, MapOf, unescapeLucene, regexToWildcard, wildcardToRegex, escapeRegex, unescapeRegex } from '@/utils';
import { FilterValue } from '@/types/apptypes';
import { AnnotationEditorDefinition } from '@/store/search/form/annotations';
import { Token, BinaryOp, Attribute } from '@/utils/cqlparser';
import { debugLog } from '@/utils/debug';
import * as Observable from 'rxjs';
import { map, switchMap, debounce, debounceTime, materialize, catchError, mapTo, tap } from 'rxjs/operators';
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
			if (this.selectedWordforms && this.selectedWordforms.length) {
				return this.selectedWordforms.map(escapeRegex).map(v => `${this.annotationId}="${v}"`).join('|');
			}

			const value = this.value as string;
			if (!value && !value.trim()) {
				return null;
			}

			const resultParts = value
			.split(/"/)
			.flatMap((v, i) => {
				if (!v) {
					return [];
				}
				const inQuotes = (i % 2) !== 0;
				// alrighty,
				// "split word" behind another few --> ["split word", "behind", "another", "few"]
				// "wild* in split words" and such --> ["wild.* in split words", "and", "such"]

				return inQuotes ? wildcardToRegex(v) : v.split(/\s+/).filter(s => !!s).map(val => wildcardToRegex(val));
			});

			debugLog('recalculated cql for annotation '+this.id);
			return resultParts.length ? this.outputMultipleTokens ? resultParts.map(v => `${this.annotationId}="${v}"`) : `${this.annotationId}="${resultParts.join('|')}"` : null;
		},
	},
	methods: {
		decodeInitialState(ast: Token[]): string|undefined {
			if (ast.length !== 1) {
				return undefined;
			}

			const token = ast[0];
			if (
				token.leadingXmlTag ||
				token.trailingXmlTag ||
				token.expression ||
				token.optional
			) {
				return undefined;
			}

			const values = [] as string[];
			const stack = [token.expression!];
			let cur: (typeof stack)[number];
			// tslint:disable-next-line
			while (cur = stack.shift()!) {
				if (cur.type === 'binaryOp') {
					stack.push(cur.left, cur.right);
				} else if (cur.type === 'attribute' && cur.name === this.annotationId) {
					values.push(unescapeRegex(cur.value));
				} else {
					// complex query? cannot parse
					return undefined;
				}
			}

			return values.join('|') || undefined;
		},
		// onInput(input: string) { this.lemma$.next(input); },
		onPosChange(input: string) { this.pos$.next(input); },
		// onSuggestionSelected(suggestion: string) { this.}
	},
	created() {
		const input$ = Observable.combineLatest(this.lemma$, this.pos$);
		const suggestions$ = input$.pipe(
			debounceTime(500),
			tap(v => console.log('getting suggestions...', v)),
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
			tap(v => console.log('received suggestions...', v)),
		);

		const results$ = Observable.merge(
			input$.pipe(mapTo(null)),
			suggestions$
		);

		this.subscriptions.push(
			results$.subscribe(r => {
			this.suggestions = r;
			console.log('got suggestions in subscribe handler', r);
		}));
	},
	destroyed() {
		this.subscriptions.forEach(s => s.unsubscribe());
	}

});
</script>

<style lang="scss">

</style>