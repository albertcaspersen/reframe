<template>
  <div class="katalog">
    <div class="katalog-scroll">

      <div class="katalog-header">
        <h1 class="katalog-title">Katalog</h1>
        <p class="katalog-sub">Mønstre og designs</p>
      </div>

      <!-- Empty state -->
      <div class="katalog-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="8" height="8" rx="1.5"/>
          <rect x="13" y="3" width="8" height="8" rx="1.5"/>
          <rect x="3" y="13" width="8" height="8" rx="1.5"/>
          <rect x="13" y="13" width="8" height="8" rx="1.5"/>
        </svg>
        <p>Ingen designs endnu</p>
        <p class="katalog-empty-sub">Dine gemte mønstre og projekter vises her</p>
      </div>

    </div>
  </div>
</template>

<script setup>
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
  padding: 0 20px 100px;
}

.katalog-header {
  padding: 56px 0 24px;
}

.katalog-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--c-text, #1a1a1a);
  letter-spacing: -0.03em;
}

.katalog-sub {
  font-size: 0.9rem;
  color: var(--c-muted, #888);
  margin-top: 4px;
}

.katalog-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 24px;
  text-align: center;
  color: var(--c-muted, #888);
}

.katalog-empty svg {
  width: 48px;
  height: 48px;
  opacity: 0.35;
}

.katalog-empty p {
  font-size: 1rem;
  font-weight: 500;
}

.katalog-empty-sub {
  font-size: 0.85rem !important;
  font-weight: 400 !important;
}
</style>
