// ─────────────────────────────────────────────────────────────────────────────
// main.js
//
// Applikationens indgangspunkt. Her startes Vue og App.vue monteres i
// det <div id="app">-element der er defineret i index.html.
// ─────────────────────────────────────────────────────────────────────────────

import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
