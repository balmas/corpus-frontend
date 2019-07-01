<template>
	<div :title="id" class="form-group propertyfield" :id="definition.id"> <!-- behaves as .row when in .form-horizontal so .row may be omitted -->

		<label :for="inputId" class="col-xs-12 col-md-3" :title="definition.description || undefined">{{definition.displayName}}</label>
		<div class="col-xs-12 col-md-9">
			<div class="input-group">
				<input
					type="text"
					class="form-control"

					:id="inputId"
					:name="inputId"
					:placeholder="definition.displayName"
					:dir="textDirection"
					:value="value.value"

					@input="e_input({value: $event.target.value, caseSensitive: value.caseSensitive})"
				/>
				<div class="input-group-btn">
					<label class="btn btn-default file-input-button" :for="fileInputId">
						<span class="fa fa-upload fa-fw"></span>
						<input
							type="file"
							title="Upload a list of values"

							:id="fileInputId"

							@change="onFileChanged"
						>
					</label>
				</div>
			</div>
			<div v-if="metadata.caseSensitive" class="checkbox">
				<label :for="caseInputId">
					<input
						type="checkbox"

						:id="caseInputId"
						:name="caseInputId"
						:checked="value.caseSensitive"

						@change="e_input({value: value.value, caseSensitive: $event.target.checked})"
					>Case and diacritics sensitive</label>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import BaseAnnotationEditor from '@/components/annotations/Annotation';

import { escapeLucene, MapOf, unescapeLucene, regexToWildcard, wildcardToRegex } from '@/utils';
import { FilterValue } from '@/types/apptypes';
import { AnnotationEditorDefinition } from '@/store/search/form/annotations';
import { Token, BinaryOp, Attribute } from '@/utils/cqlparser';
import { debugLog } from '@/utils/debug';

type Metadata = {
	caseSensitive: boolean;
};

type Value = {
	value: string;
	caseSensitive: boolean;
};

export default BaseAnnotationEditor.extend({
	props: {
		value: {
			type: Object as () => Value,
			required: true,
			default: () => ({
				value: '',
				caseSensitive: false,
			})
		},
	},
	computed: {
		fileInputId(): string { return this.inputId + '_file'; },
		caseInputId(): string { return this.inputId + '_case'; },
		metadata(): Metadata { return this.definition.metadata as Metadata; },
		cql(): string|string[]|null {
			const {value, caseSensitive} = this.value as Value;

			let resultParts = value
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

			resultParts = resultParts.map(v => caseSensitive ? `(?-i)${v}` : v);
			return resultParts.length ? this.outputMultipleTokens ? resultParts.map(v => `${this.annotationId}="${v}"`) : `${this.annotationId}="${resultParts.join('|')}"` : null;
		},
	},
	methods: {
		decodeInitialState(ast: Token[]): Value|undefined {
			function isCase(value: string) { return value.startsWith('(?-i)') || value.startsWith('(?c)'); }
			function stripCase(value: string) { return value.substr(value.startsWith('(?-i)') ? 5 : 4); }

			const values: Array<string|null> = [];
			let caseSensitive = false;

			for (const token of ast) {
				let hasValueAtPosition = false;
				if (token.leadingXmlTag || token.trailingXmlTag || token.repeats || token.optional) {
					return undefined;
				}

				const stack = [token.expression];
				let exp: Token['expression'];
				// tslint:disable-next-line
				while (exp = stack.shift()) {
					if (exp.type === 'binaryOp') {
						if (exp.operator !== 'AND' && exp.operator !== '&') {
							// Clauses combined in an unsupported way, cannot parse.
							return undefined;
						}

						stack.push(exp.left, exp.right);
					} else if (exp.name === this.annotationId) {
						if (hasValueAtPosition) {
							// multiple values for the same annotation in the same token - unsupported.
							return undefined;
						}

						let value = exp.value;
						if (isCase(value)) {
							value = stripCase(exp.value);
							caseSensitive = true;
						}
						value = regexToWildcard(value);
						if (value.match(/\s+/)) {
							value = `"${value}"`;
						}
						values.push(value);
						hasValueAtPosition = true;
					}
				}
			}

			return {
				caseSensitive,
				value: values.join(' ')
			};
		},
		onFileChanged(event: Event) {
			const self = this;
			const fileInput = event.target as HTMLInputElement;
			const file = fileInput.files && fileInput.files[0];
			if (file != null) {
				const fr = new FileReader();
				fr.onload = function() {
					// Replace all whitespace with pipes,
					// Same as the querybuilder wordlist upload
					self.e_input({
						caseSensitive: self.value.caseSensitive,
						value: (fr.result as string).trim().replace(/\s+/g, '|')
					});
				};
				fr.readAsText(file);
			} else {
				self.e_input({
					caseSensitive: self.value.caseSensitive,
					value: '',
				});
			}
			(event.target as HTMLInputElement).value = '';
		},
	},
});
</script>

<style lang="scss">

</style>