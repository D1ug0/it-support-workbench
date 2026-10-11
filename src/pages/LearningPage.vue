<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import LearningJourney from '../features/learning/LearningJourney.vue'
const route = useRoute()
const LegacyLearningPage = defineAsyncComponent(() => import('./LegacyLearningPage.vue'))
// Preserve existing deep links and journals while the default entry uses one learner journey.
const legacy = computed(
  () =>
    ['workshop', 'advanced', 'practice', 'journal', 'quiz'].includes(String(route.query.view)) ||
    typeof route.query.course === 'string' ||
    typeof route.query.topic === 'string',
)
</script>
<template><LegacyLearningPage v-if="legacy" /><LearningJourney v-else /></template>
