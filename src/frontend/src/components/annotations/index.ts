import { PluginObject } from 'vue';

import AnnotationText from './AnnotationText.vue';

const annotationPlugin: PluginObject<never> = {
	install(vue) {
		vue.component('annotation-text', AnnotationText);
	}
};

export default annotationPlugin;
