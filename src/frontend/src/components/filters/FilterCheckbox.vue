<template>
	<div
		class="form-group filterfield"
		:id="id"
		:data-filterfield-type="definition.componentName"
	>
		<label class="col-xs-12" :for="inputId">{{displayName}}</label>
		<div class="col-xs-12">
			<div class="checkbox" v-for="(option, index) in options" :key="index">
				<label :for="inputId+'_'+index" :title="option.title"><input
					type="checkbox"

					:value="option"
					:name="inputId+'_'+index"
					:id="inputId+'_'+index"

					v-model="model"
				> {{option.label || option.value}}</label>
			</div>
		</div>
	</div>
</template>


<script lang="ts">
import BaseFilter from '@/components/filters/Filter';
import { Option } from '@/components/SelectPicker.vue';
import { MapOf, mapReduce, escapeLucene, unescapeLucene } from '@/utils';
import { FilterValue } from '@/utils/luceneparser';

export default BaseFilter.extend({
	props: {
		value: {
			type: Array as () => string[],
			required: true,
			default: () => []
		}
	},
	computed: {
		model: {
			get(): string[] { return this.value.map(v => this.options.find(o => o.value === v)!); },
			set(v: Option[]) { this.e_input(v.map(o => o.value)); }
		},
		options(): Option[] { return this.definition.metadata; },
		optionsMap(): MapOf<Option> { return mapReduce(this.options, 'value'); },
		luceneQuery(): string|null {
			// Values for checkboxes are predetermined (i.e. user can't type in these fields)
			// So copy out the values without wildcard substitution or regex escaping.
			// Surround each individual values with quotes, and surround the total with brackets
			const selected = Object.entries(this.value)
				.filter(([value, isSelected]) => isSelected)
				.map(([value, isSelected]) => escapeLucene(value, false));

			return selected.length ? `${this.id}:(${selected.join(' ')})` : null;
		},
		luceneQuerySummary(): string|null {
			const selected = Object.entries(this.value)
				.filter(([value, isSelected]) => isSelected)
				.map(([value, isSelected]) => this.optionsMap[value].label || value);

			const value = selected.length >= 2 ? selected.map(v => `"${v}"`).join(', ') : selected[0] || null;
			return value ? `${this.displayName}: ${value}` : null;
		}
	},
	methods: {
		decodeInitialState(filterValues: MapOf<FilterValue>): string[] {
			const v = filterValues[this.id];

			return v ? v.values : [];
		},
	},
});
</script>

<style lang="scss">

</style>