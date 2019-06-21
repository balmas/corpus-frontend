<template>
	<div class="form-group propertyfield" :id="definition.id"> <!-- behaves as .row when in .form-horizontal so .row may be omitted -->
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

					@input="e_input({value: $event, caseSensitive})"
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
			<div v-if="annotation.caseSensitive" class="checkbox">
				<label :for="caseInputId">
					<input
						type="checkbox"

						:id="caseInputId"
						:name="caseInputId"
						:checked="value.caseSensitive"

						@change="e_input({value: value.value, caseSensitive: $event})"
					>
					Case&nbsp;and&nbsp;diacritics&nbsp;sensitive
				</label>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import BaseAnnotationEditor from '@/components/annotations/Annotation';

import { escapeLucene, MapOf, unescapeLucene, escapeRegex } from '@/utils';
import { FilterValue } from '@/types/apptypes';
import { AnnotationEditorDefinition } from '../../store/search/form/annotations';

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
			default: {
				value: '',
				caseSensitive: false,
			}
		},
	},
	computed: {
		metadata(): Metadata { return this.definition.metadata as Metadata; },
		cql(): string|string[]|null {
			const {value, caseSensitive} = this.value as Value;

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

				return inQuotes ? escapeRegex(v, true) : v.split(/\s+/).filter(s => !!s).map(val => escapeRegex(val, true));
			});

			return resultParts.length ? resultParts.map(v => caseSensitive ? `(?-i)${v}` : v).map(v => `${this.id}="${v}"`) : null;
		},
		stringvalue(): string[] {
			const {value} = this.value as Value;

			const resultParts = value
			.split(/"/)
			.flatMap((v, i) => {
				if (!v) {
					return [];
				}
				const inQuotes = (i % 2) !== 0;
				return inQuotes ? v : v.split(/\s+/).filter(s => !!s);
			});

			return resultParts; // may be empty
		},
	},
	methods: {
		decodeInitialState(filterValues: MapOf<FilterValue>): Value {
			const v = filterValues[this.id];
			return undefined as any;
			// return v ? v.values.map(unescapeLucene).map(val => val.match(/\s+/) ? `"${val}"` : val).join(' ') || null : null;
		}
	}
});
</script>

<style lang="scss">

</style>