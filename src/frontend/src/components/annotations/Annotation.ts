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
		textDirection: {
			type: String as () => 'ltr'|'rtl',
			required: true
		},
		/** Allow split entered values over over multiple tokens or not? */
		outputMultipleTokens: Boolean
	},
	methods: {
		// Implemented as multiple events because our value is a prop
		// and thus computing lucene is a second event (value out through event -> value in through prop -> lucene out)
		e_input(value: any) { this.$emit('change-value', value); },
		e_changeCql(cql: string|string[]|null) { this.$emit('change-cql', cql); },

		/**
		 * Called on first load, convert the initial query to a valid state for the value prop,
		 * what this looks like is up to the implementation.
		 * When this is called the component will not have been mounted, though all props with exception of value will be available.
		 * If the query could not be decoded, null should be returned.
		 */
		decodeInitialState(ast: Token[]): any { throw new Error('missing decodeInitialState() implementation in annotation editor'); },
	},
	computed: {
		id(): string { return this.definition.id + (this as any).uid; },
		annotationId(): string { return this.definition.id; },
		inputId(): string { return `${this.id}_value`; },
		displayName(): string { return this.definition.displayName || this.definition.id; },
		description(): string|undefined { return this.definition.description; },

		cql(): string|string[]|null { throw new Error('missing cqlQuery() implementation in annotation editor'); },
	},
	watch: {
		cql(v: string|string[]|null) { this.e_changeCql(v); },
	},
});

export default baseAnnotationEditor;
