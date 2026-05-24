<template>
  <div class="stof-arkiv">
    <div class="stof-arkiv-scroll">

      <div class="stof-header">
        <h1 class="stof-title">Stof-arkiv</h1>
        <p class="stof-sub">Dine gemte stofrester</p>
      </div>

      <!-- Empty state -->
      <div class="stof-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 7V5a2 2 0 0 0-4 0v2"/>
          <path d="M7 12h10M7 16h6"/>
        </svg>
        <p>Ingen stofrester endnu</p>
        <p class="stof-empty-sub">Scan en ny rest for at tilføje den til dit arkiv</p>
      </div>

    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.stof-arkiv {
  position: absolute;
  inset: 0;
  background: #F2EEF3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stof-arkiv-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 100px;
}

.stof-header {
  padding: 56px 0 24px;
}

.stof-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--c-text, #1a1a1a);
  letter-spacing: -0.03em;
}

.stof-sub {
  font-size: 0.9rem;
  color: var(--c-muted, #888);
  margin-top: 4px;
}

.stof-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 24px;
  text-align: center;
  color: var(--c-muted, #888);
}

.stof-empty svg {
  width: 48px;
  height: 48px;
  opacity: 0.35;
}

.stof-empty p {
  font-size: 1rem;
  font-weight: 500;
}

.stof-empty-sub {
  font-size: 0.85rem !important;
  font-weight: 400 !important;
}
</style>
