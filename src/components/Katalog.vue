<template>
  <div class="katalog">
    <div class="katalog-scroll">

      <!-- Header -->
      <div class="katalog-header">
        <p class="katalog-eyebrow">Katalog</p>
        <h1 class="katalog-title">Find dit næste projekt</h1>
      </div>

      <!-- Search bar -->
      <div class="katalog-search-wrap">
        <input
          v-model="searchQuery"
          class="katalog-search-input"
          type="search"
          placeholder="SØG"
        />
        <svg class="katalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="22" y2="22"/>
        </svg>
      </div>

      <!-- Featured banner -->
      <div class="katalog-banner">
        <img class="katalog-banner-img" src="/katalogpics/overlocks.png" alt="Overlocks" />
        <div class="katalog-banner-overlay">
          <div class="katalog-banner-text">
            <h2 class="katalog-banner-title">Overlocks</h2>
            <p class="katalog-banner-sub">Lær at sy en overlock</p>
          </div>
          <button class="katalog-banner-play" aria-label="Afspil">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20"/>
            </svg>
          </button>
        </div>
      </div>
      <p class="katalog-banner-credit">Provided by Selfmade</p>

      <!-- Category tabs -->
      <div class="katalog-tabs">
        <button
          v-for="cat in categories"
          :key="cat"
          class="katalog-tab"
          :class="{ active: activeCategory === cat }"
          @click="activeCategory = cat"
        >{{ cat }}</button>
      </div>

      <!-- Project grid -->
      <ul class="katalog-grid">
        <li
          v-for="project in filteredProjects"
          :key="project.id"
          class="katalog-card"
        >
          <img class="katalog-card-img" :src="project.img" :alt="project.name" />
          <div class="katalog-card-body">
            <p class="katalog-card-name">{{ project.name }}</p>
            <div class="katalog-card-meta">
              <span class="katalog-card-parts">Består af {{ project.parts }} dele</span>
              <span class="katalog-card-time">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <polyline points="12,7 12,12 15,15"/>
                </svg>
                {{ project.time }}
              </span>
            </div>
          </div>
        </li>
      </ul>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const searchQuery = ref('')
const activeCategory = ref('Alle')

const categories = ['Alle', 'Tøj', 'Tasker', 'Hjem', 'Børn']

const projects = [
  { id: 1, name: 'Bindebånds skørt', img: '/katalogpics/skørt.png',      parts: 4, time: '3-4 t', category: 'Tøj' },
  { id: 2, name: 'Panel jeans',       img: '/katalogpics/jeans.png',      parts: 6, time: '4-5 t', category: 'Tøj' },
  { id: 3, name: 'Sløjfevest',        img: '/katalogpics/sløjfevest.png', parts: 4, time: '3-4 t', category: 'Tøj' },
]

const filteredProjects = computed(() => {
  return projects.filter(p => {
    const matchCat = activeCategory.value === 'Alle' || p.category === activeCategory.value
    const matchSearch = p.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    return matchCat && matchSearch
  })
})
</script>

<style scoped>
.katalog {
  position: absolute;
  inset: 0;
  background: #F2EEF3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.katalog-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 20px calc(var(--nav-h, 60px) + 24px);
}

/* Header */
.katalog-header {
  padding: max(env(safe-area-inset-top), 52px) 0 20px;
}
.katalog-eyebrow {
  font-size: 0.88rem;
  font-weight: 300;
  letter-spacing: 0;
  color: rgb(116, 116, 116);
  text-transform: none;
  margin-bottom: 2px;
}
.katalog-title {
  font-size: 1.75rem;
  font-weight: 400;
  color: #1a1a1a;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-top: 0.5rem;
}

/* Search */
.katalog-search-wrap {
  position: relative;
  margin-bottom: 18px;
}
.katalog-search-input {
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  border: 1.5px solid #7B52BF;
  border-radius: 999px;
  padding: 13px 48px 13px 20px;
  font-size: 0.95rem;
  font-family: inherit;
  font-weight: 400;
  letter-spacing: 0.06em;
  color: #111;
  outline: none;
  transition: border-color 0.18s;
  -webkit-appearance: none;
  appearance: none;
}
.katalog-search-input::placeholder {
  color: #aaa;
  letter-spacing: 0.1em;
}
.katalog-search-input:focus {
  border-color: #7B52BF;
}
.katalog-search-input::-webkit-search-cancel-button { display: none; }
.katalog-search-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: #aaa;
  pointer-events: none;
}

/* Featured banner */
.katalog-banner {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 0;
  aspect-ratio: 16 / 9;
  background: #3a1f6e;
}
.katalog-banner-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.katalog-banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(30,10,60,0.72) 0%, transparent 55%);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 16px 16px 20px;
}
.katalog-banner-text {
  flex: 1;
}
.katalog-banner-title {
  font-size: 1.8rem;
  font-weight: 400;
  color: #fff;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.katalog-banner-sub {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.8);
  margin-top: 3px;
  font-weight: 300;
}
.katalog-banner-play {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255,255,255,0.22);
  border: 2px solid rgba(255,255,255,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  color: #fff;
  transition: background 0.15s;
  margin-left: 12px;
  margin-bottom: 4px;
}
.katalog-banner-play svg {
  width: 16px;
  height: 16px;
  margin-left: 2px;
}
.katalog-banner-credit {
  font-size: 0.65rem;
  color: #aaa;
  font-style: italic;
  letter-spacing: 0.02em;
  text-align: right;
  margin-top: 4px;
  margin-bottom: 16px;
}

/* Category tabs */
.katalog-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.katalog-tabs::-webkit-scrollbar { display: none; }
.katalog-tab {
  flex-shrink: 0;
  padding: 6px 16px;
  border-radius: 999px;
  border: none;
  background: transparent;
  font-size: 0.88rem;
  font-weight: 500;
  font-family: inherit;
  color: #888;
  cursor: pointer;
  transition: color 0.18s;
  position: relative;
}
.katalog-tab.active {
  color: #7B52BF;
  font-weight: 700;
}
.katalog-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 16px;
  right: 16px;
  height: 2px;
  background: #7B52BF;
  border-radius: 1px;
}

/* Divider under tabs */
.katalog-tabs::after {
  content: '';
  display: block;
  border-bottom: 1px solid rgba(0,0,0,0.1);
}

/* Project grid */
.katalog-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.katalog-card {
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid #7C5CBF;
  cursor: pointer;
  transition: transform 0.12s;
  display: flex;
  flex-direction: column;
}
.katalog-card:active { transform: scale(0.97); }
.katalog-card-img {
  width: 100%;
  aspect-ratio: 4 / 4;
  object-fit: cover;
  display: block;
}
.katalog-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.katalog-card-name {
  font-size: 0.92rem;
  font-weight: 400;
  color: #111;
  letter-spacing: -0.01em;
  line-height: 1.25;
}
.katalog-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.katalog-card-parts {
  font-size: 0.68rem;
  color: #aaa;
  font-weight: 300;
}
.katalog-card-time {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.72rem;
  color: #7B52BF;
  font-weight: 300;
}
.katalog-card-time svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  stroke: #7B52BF;
}
</style>
