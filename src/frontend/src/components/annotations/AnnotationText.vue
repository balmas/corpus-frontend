
<template>
	<div :title="id" class="form-group propertyfield" :id="definition.id"> <!-- behaves as .row when in .form-horizontal so .row may be omitted -->
		<label v-if="size === 'm'" :for="inputId" :class="['col-xs-12', 'col-md-3', {disabled}]" :title="definition.description || undefined">{{definition.displayName}}</label>
		<div class="input-group col-xs-12 col-md-9">
			<input
				type="text"

				:id="inputId"
				:name="inputId"
				:class="{'form-control':true,'input-lg':size==='l','input-sm':size==='s'}"
				:placeholder="definition.displayName"
				:dir="textDirection"
				:value="value.value"
				:disabled="disabled"

				@input="e_input({value: $event.target.value, caseSensitive: value.caseSensitive})"
			/>
			<div class="input-group-btn">
				<label :class="['btn btn-default file-input-button', {disabled,'btn-lg':size==='l','btn-sm':size==='s'}]" :for="fileInputId">
					<span class="fa fa-upload fa-fw"></span>
					<input
						type="file"
						title="Upload a list of values"

						:id="fileInputId"
						:disabled="disabled"

						@change="onFileChanged"
					>
				</label>
			</div>
		</div>
		<div v-if="metadata.caseSensitive && size === 'm'" class="checkbox col-xs-12 col-md-9 col-md-push-3 checkbox-col">
			<label :for="caseInputId" :class="{disabled}">
				<input
					type="checkbox"

					:id="caseInputId"
					:name="caseInputId"
					:checked="value.caseSensitive"
					:disabled="disabled"

					@change="e_input({value: value.value, caseSensitive: $event.target.checked})"
				>Case and diacritics sensitive</label>
		</div>
	</div>
</template>

<script lang="ts">
import BaseAnnotationEditor, { SimpleCqlToken } from '@/components/annotations/Annotation';

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
			if (!value && !value.trim()) {
				return null;
			}

			// if single token, transform wildcards and return entire value
			if (!this.outputMultipleTokens) {
				return `${this.annotationId}="${caseSensitive ? '(?-i)' : ''}${wildcardToRegex(value)}"`;
			}

			// if multiple tokens, split on quotes and whitespace outside quotes, and transform wildcards
			let resultParts = value
			.trim()
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
		decodeInitialState(cql: SimpleCqlToken[], ast: Token[]): Value|undefined {
			function isCase(value: string) { return value.startsWith('(?-i)') || value.startsWith('(?c)'); }
			function stripCase(value: string) { return value.substr(value.startsWith('(?-i)') ? 5 : 4); }

			if (!this.outputMultipleTokens) {
				cql = cql.slice(0, 1);
			}

			// remove trailing tokens without a value for this annotation
			while (cql.length && !cql[cql.length-1][this.annotationId]) {
				cql.pop();
			}

			let caseSensitive = false;
			const values = cql.map(token => {
				const tokenValues = token[this.annotationId] || [];
				caseSensitive = caseSensitive || (this.metadata.caseSensitive && tokenValues.some(isCase));

				const joinedValue = tokenValues ? tokenValues.map(v => isCase(v) ? stripCase(v) : v).map(regexToWildcard).join('|') : '*';
				return joinedValue.match(/\s+/) && this.outputMultipleTokens ? `"${joinedValue}"` : joinedValue;
			});

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