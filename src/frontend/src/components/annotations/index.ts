import { PluginObject } from 'vue';

import AnnotationText from './AnnotationText.vue';
import AnnotationLexicon from './AnnotationLexicon.vue';

const annotationPlugin: PluginObject<never> = {
	install(vue) {
		vue.component('annotation-text', AnnotationText);
		vue.component('annotation-lexicon', AnnotationLexicon);
	}
};

export default annotationPlugin;
