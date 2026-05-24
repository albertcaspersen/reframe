<template>
  <div class="profil">
    <div class="profil-scroll">

      <div class="profil-header">
        <div class="profil-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <h1 class="profil-name">Amalie</h1>
        <p class="profil-sub">Din profil</p>
      </div>

      <!-- Stats -->
      <div class="profil-stats">
        <div class="profil-stat">
          <span class="profil-stat-num">4</span>
          <span class="profil-stat-label">Scanninger</span>
        </div>
        <div class="profil-stat">
          <span class="profil-stat-num">12</span>
          <span class="profil-stat-label">Projekter</span>
        </div>
        <div class="profil-stat">
          <span class="profil-stat-num">3</span>
          <span class="profil-stat-label">Designs</span>
        </div>
      </div>

      <!-- Settings list -->
      <ul class="profil-list">
        <li class="profil-list-item">
          <span>Notifikationer</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </li>
        <li class="profil-list-item">
          <span>Måleenheder</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </li>
        <li class="profil-list-item">
          <span>Om ReFrame</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </li>
      </ul>

    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.profil {
  position: absolute;
  inset: 0;
  background: #F2EEF3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.profil-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 100px;
}

.profil-header {
  padding: 56px 0 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.profil-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--c-surface, #F0EDE8);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.profil-avatar svg {
  width: 36px;
  height: 36px;
  color: var(--c-muted, #888);
}

.profil-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--c-text, #1a1a1a);
  letter-spacing: -0.03em;
}

.profil-sub {
  font-size: 0.9rem;
  color: var(--c-muted, #888);
}

.profil-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 32px;
}

.profil-stat {
  flex: 1;
  background: var(--c-surface, #F0EDE8);
  border-radius: 14px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.profil-stat-num {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--c-text, #1a1a1a);
}

.profil-stat-label {
  font-size: 0.75rem;
  color: var(--c-muted, #888);
  text-align: center;
}

.profil-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profil-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 4px;
  border-bottom: 1px solid var(--c-divider, rgba(0,0,0,0.07));
  font-size: 0.95rem;
  color: var(--c-text, #1a1a1a);
  cursor: pointer;
}

.profil-list-item svg {
  width: 16px;
  height: 16px;
  color: var(--c-muted, #bbb);
}
</style>
