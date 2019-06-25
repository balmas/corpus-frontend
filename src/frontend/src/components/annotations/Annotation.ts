import Vue from 'vue';

import { AnnotationEditorDefinition } from '@/store/search/form/annotations';
import { Token } from '@/utils/cqlparser';
import uid from '@/mixins/uid';

const baseAnnotationEditor = Vue.extend({
	mixins: [uid],
	props: {
		definition: {
			type: Object as () => AnnotationEditorDefinition,
			required: true
		},
		// you should probably set a default value in the extended component.
		value: undefined as any as () => any,
		// initialStringValue: Array as () => string[],
		textDirection: {
			type: String as () => 'ltr'|'rtl',
			required: true
		},
	},
	methods: {
		// Implemented as multiple events because our value is a prop
		// and thus computing lucene is a second event (value out through event -> value in through prop -> lucene out)
		e_input(value: any) { this.$emit('change-value', value); },
		e_changeCql(cql: string|string[]|null) { this.$emit('change-cql', cql); },
		// e_changeStringValue(stringValue: string[]) { this.$emit('change-string-value', stringValue); },

		/**
		 * Called on first load, convert the initial query to a valid state for the value prop,
		 * what this looks like is up to the implementation.
		 * When this is called the component will not have been mounted, though all props with exception of value will be available.
		 * If the query could not be decoded, null should be returned.
		 */
		decodeInitialState(ast: Token[]): any { throw new Error('missing decodeInitialState() implementation in annotation editor'); },
		// decodeInitialStateFromStringValue(sv: string[]) { throw new Error('missing decodeInitialStateFromStringValue() implementation in annotation editor'); }
	},
	computed: {
		id(): string { return this.definition.id + (this as any).uid; },
		annotationId(): string { return this.definition.id; },
		inputId(): string { return `${this.id}_value`; },
		displayName(): string { return this.definition.displayName || this.definition.id; },
		description(): string|undefined { return this.definition.description; },

		cql(): string|string[]|null { throw new Error('missing cqlQuery() implementation in annotation editor'); },
		// stringValue(): string[] { throw new Error('missing stringValue() implementation in annotation editor'); }
	},
	watch: {
		cql(v: string|string[]|null) { this.e_changeCql(v); },
		// stringValue(v: string[]) { this.e_changeStringValue(v); },
	},
	// created() {
	// 	if ((this.$options.propsData as any).value == null && (this.$options.propsData as any).initialStringValue.length) {
	// 		this.e_input(this.decodeInitialStateFromStringValue(this.initialStringValue));
	// 	}
	// }
});

export default baseAnnotationEditor;
