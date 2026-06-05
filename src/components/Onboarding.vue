<script setup>
import { ref } from 'vue'

const emit = defineEmits(['done'])

const step = ref(0)

function next() {
  if (step.value < 2) step.value++
  else finish()
}
function skip() { finish() }
function finish() {
  emit('done')
}
</script>

<template>
  <div class="ob-wrap">

    <!-- Top bar -->
    <div class="ob-topbar">
      <div class="ob-dots">
        <span v-for="i in 3" :key="i" class="ob-dot" :class="{ active: i - 1 === step }" />
      </div>
      <img src="/logo/LOGO3.png" class="ob-logo" alt="ReFrame" />
      <button class="ob-skip" @click="skip">Spring over</button>
    </div>

    <!-- Slide content -->
    <Transition name="ob-slide" mode="out-in">

      <!-- ── SIDE 1: Problemet ─────────────────────────────────────────── -->
      <div v-if="step === 0" class="ob-slide" key="s0">
        <div class="ob-illus">
          <svg viewBox="0 0 320 265" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <!-- Fabric: rounded rectangle — geometric, fabric-like proportions -->
            <rect x="52" y="18" width="228" height="230" rx="28"
              fill="#3A2068"/>

            <!-- Piece 1: tan rectangle — top-left, inside -->
            <g class="piece piece-1">
              <rect x="70" y="36" width="110" height="72" rx="4"
                fill="#C99870" stroke="#9E6840" stroke-width="2" stroke-dasharray="7 4"/>
            </g>

            <!-- Piece 2: pink/mauve tall rectangle — right column, inside -->
            <g class="piece piece-2">
              <rect x="196" y="30" width="68" height="160" rx="4"
                fill="#C48FA8" stroke="#9E607A" stroke-width="2" stroke-dasharray="7 4"/>
            </g>

            <!-- Piece 3: blue/cyan rectangle — sticks out LEFT beyond the fabric edge -->
            <g class="piece piece-3">
              <rect x="14" y="120" width="136" height="90" rx="4"
                fill="#7EC4D0" stroke="#4A8FA0" stroke-width="2" stroke-dasharray="7 4"/>
            </g>

            <!-- Piece 4: red triangle — bottom-right, inside -->
            <g class="piece piece-4">
              <polygon points="130,240 260,240 195,152"
                fill="#C86070" stroke="#A03850" stroke-width="2" stroke-dasharray="7 4"/>
            </g>
          </svg>
        </div>
        <div class="ob-content">
          <h1 class="ob-heading">Er der overhovedet plads nok?</h1>
          <p class="ob-body">På kun et par minutter kan du tjekke om dine mønsterdele passer til dit stof</p>
        </div>
      </div>

      <!-- ── SIDE 2: Sådan virker det ─────────────────────────────────── -->
      <div v-else-if="step === 1" class="ob-slide" key="s1">
        <div class="ob-illus">
          <svg viewBox="0 0 320 230" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <pattern id="hatch1" patternUnits="userSpaceOnUse" width="14" height="14">
                <line x1="0" y1="0" x2="14" y2="14" stroke="#9B7FCC" stroke-width="1.2" stroke-opacity="0.5"/>
                <line x1="14" y1="0" x2="0" y2="14" stroke="#9B7FCC" stroke-width="1.2" stroke-opacity="0.5"/>
              </pattern>
              <clipPath id="blob1">
                <path d="M 28 58 C 16 26 62 6 108 10 C 154 14 178 2 218 16 C 258 30 282 18 298 52 C 314 86 302 124 282 152 C 262 180 240 200 196 204 C 152 208 118 198 84 194 C 50 190 24 178 10 154 C -4 130 40 90 28 58 Z"/>
              </clipPath>
            </defs>
            <!-- Fabric blob -->
            <path d="M 28 58 C 16 26 62 6 108 10 C 154 14 178 2 218 16 C 258 30 282 18 298 52 C 314 86 302 124 282 152 C 262 180 240 200 196 204 C 152 208 118 198 84 194 C 50 190 24 178 10 154 C -4 130 40 90 28 58 Z"
              fill="#9B7FCC"/>
            <!-- Crosshatch -->
            <rect x="0" y="0" width="320" height="230" fill="url(#hatch1)" clip-path="url(#blob1)" opacity="0.6"/>
            <!-- Blob outline / selection -->
            <path d="M 28 58 C 16 26 62 6 108 10 C 154 14 178 2 218 16 C 258 30 282 18 298 52 C 314 86 302 124 282 152 C 262 180 240 200 196 204 C 152 208 118 198 84 194 C 50 190 24 178 10 154 C -4 130 40 90 28 58 Z"
              stroke="#5C3B9E" stroke-width="2.5" fill="none"/>
            <!-- Corner handle dots -->
            <circle cx="28" cy="58" r="5" fill="#5C3B9E"/>
            <circle cx="298" cy="52" r="5" fill="#5C3B9E"/>
            <circle cx="282" cy="152" r="5" fill="#5C3B9E"/>
            <circle cx="10" cy="154" r="5" fill="#5C3B9E"/>

            <!-- Pattern piece: FORSTK. -->
            <rect x="40" y="46" width="84" height="64" rx="5"
              fill="white" fill-opacity="0.88" stroke="#7C5CBF" stroke-width="1.8" stroke-dasharray="5 4"/>
            <text x="82" y="82" text-anchor="middle" font-family="'Lexend Deca', sans-serif"
              font-size="9.5" font-weight="600" fill="#7C5CBF" letter-spacing="0.5">FORSTK.</text>

            <!-- Pattern piece: ÆRME (slightly irregular) -->
            <path d="M 140 44 Q 164 36 190 46 L 194 104 Q 166 112 140 104 Z"
              fill="white" fill-opacity="0.88" stroke="#7C5CBF" stroke-width="1.8" stroke-dasharray="5 4"/>
            <text x="167" y="80" text-anchor="middle" font-family="'Lexend Deca', sans-serif"
              font-size="9.5" font-weight="600" fill="#7C5CBF" letter-spacing="0.5">ÆRME</text>

            <!-- Pattern piece: LOMME -->
            <rect x="40" y="124" width="70" height="54" rx="5"
              fill="white" fill-opacity="0.88" stroke="#7C5CBF" stroke-width="1.8" stroke-dasharray="5 4"/>
            <text x="75" y="155" text-anchor="middle" font-family="'Lexend Deca', sans-serif"
              font-size="9.5" font-weight="600" fill="#7C5CBF" letter-spacing="0.5">LOMME</text>

            <!-- Pattern piece: KRAVE -->
            <rect x="124" y="124" width="84" height="54" rx="5"
              fill="white" fill-opacity="0.88" stroke="#7C5CBF" stroke-width="1.8" stroke-dasharray="5 4"/>
            <text x="166" y="155" text-anchor="middle" font-family="'Lexend Deca', sans-serif"
              font-size="9.5" font-weight="600" fill="#7C5CBF" letter-spacing="0.5">KRAVE</text>

            <!-- Passer badge -->
            <rect x="192" y="182" width="110" height="36" rx="18"
              fill="#2E9E5A"/>
            <!-- Checkmark -->
            <polyline points="206,200 213,208 228,192"
              stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <text x="244" y="205" text-anchor="middle" font-family="'Lexend Deca', sans-serif"
              font-size="14" font-weight="700" fill="white">Passer</text>
          </svg>
        </div>
        <div class="ob-content">
          <p class="ob-label">SÅDAN VIRKER DET</p>
          <h1 class="ob-heading">Scan stoffet — vi <em>nester</em> delene</h1>
          <p class="ob-body">Tag ét billede. Appen finder kanten på din stofrest og placerer mønsterdelene, så du straks ved om de passer.</p>
        </div>
      </div>

      <!-- ── SIDE 3: Nye mønstre ────────────────────────────────────────── -->
      <div v-else class="ob-slide" key="s2">
        <div class="ob-illus">
          <svg viewBox="0 0 320 230" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <!-- Card 1 (back) — orange/tan, rotated left -->
            <g transform="translate(100,30) rotate(-14, 70, 95)">
              <rect x="0" y="0" width="140" height="180" rx="16" fill="#D4895A"/>
              <rect x="10" y="148" width="120" height="10" rx="4" fill="#B87040" fill-opacity="0.5"/>
              <rect x="10" y="163" width="80" height="10" rx="4" fill="#B87040" fill-opacity="0.4"/>
              <!-- bag icon -->
              <path d="M 52 60 Q 52 44 70 44 Q 88 44 88 60 L 92 90 L 48 90 Z"
                stroke="#B87040" stroke-width="3" fill="none" stroke-linecap="round"/>
              <rect x="48" y="90" width="44" height="34" rx="4" stroke="#B87040" stroke-width="3" fill="none"/>
            </g>
            <!-- Card 2 (mid) — teal, slightly rotated right -->
            <g transform="translate(90,24) rotate(5, 70, 95)">
              <rect x="0" y="0" width="140" height="180" rx="16" fill="#2B8A87"/>
              <rect x="10" y="148" width="120" height="10" rx="4" fill="#1D6B68" fill-opacity="0.5"/>
              <rect x="10" y="163" width="80" height="10" rx="4" fill="#1D6B68" fill-opacity="0.4"/>
              <!-- bowl/bucket icon -->
              <path d="M 46 54 L 94 54 L 86 96 Q 70 104 54 96 Z"
                stroke="#1D6B68" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="40" y1="54" x2="100" y2="54" stroke="#1D6B68" stroke-width="3" stroke-linecap="round"/>
            </g>
            <!-- Card 3 (front) — dark blue -->
            <g transform="translate(86,16)">
              <rect x="0" y="0" width="148" height="188" rx="16" fill="#2A3D6E"/>
              <rect x="12" y="156" width="124" height="10" rx="4" fill="#1A2B52" fill-opacity="0.5"/>
              <rect x="12" y="170" width="84" height="10" rx="4" fill="#1A2B52" fill-opacity="0.4"/>
              <!-- top/shirt icon -->
              <path d="M 52 52 L 40 68 L 52 72 L 52 110 L 96 110 L 96 72 L 108 68 L 96 52 Q 74 62 52 52 Z"
                stroke="#8BA3D8" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </g>

            <!-- Uge 23 badge -->
            <rect x="188" y="14" width="104" height="34" rx="17" fill="#7C5CBF"/>
            <!-- Calendar icon -->
            <rect x="200" y="22" width="18" height="18" rx="3" fill="white" fill-opacity="0.25" stroke="white" stroke-width="1.5"/>
            <line x1="204" y1="22" x2="204" y2="19" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="214" y1="22" x2="214" y2="19" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="200" y1="28" x2="218" y2="28" stroke="white" stroke-width="1" stroke-opacity="0.5"/>
            <text x="250" y="36" text-anchor="middle" font-family="'Lexend Deca', sans-serif"
              font-size="13" font-weight="700" fill="white">Uge 23</text>
          </svg>
        </div>
        <div class="ob-content">
          <p class="ob-label">ALTID NOGET NYT</p>
          <h1 class="ob-heading">Nye mønstre <em>hver uge</em></h1>
          <p class="ob-body">Hent friske mønsterdele til nye projekter hver uge — så har du altid en grund til at hive en rest frem og tjekke.</p>
        </div>
      </div>

    </Transition>

    <!-- Footer -->
    <div class="ob-footer">
      <button class="ob-btn" @click="next">
        {{ step < 2 ? 'Videre →' : 'Kom i gang →' }}
      </button>
      <p v-if="step === 2" class="ob-login">
        Har du allerede en konto? <a href="#" @click.prevent>Log ind</a>
      </p>
    </div>

  </div>
</template>

<style scoped>
.ob-wrap {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: #FAF7F0;
  font-family: 'Lexend Deca', -apple-system, sans-serif;
  overflow: hidden;
  /* Safe areas for notch/home bar */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* ── Top bar ── */
.ob-topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 20px 24px 0;
  flex-shrink: 0;
}
.ob-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.ob-dots {
  display: flex;
  gap: 8px;
}
.ob-dot {
  width: 28px;
  height: 4px;
  border-radius: 2px;
  background: #C8C4D8;
  transition: background 0.3s;
}
.ob-dot.active {
  background: #7C5CBF;
}

.ob-skip {
  background: none;
  border: none;
  padding: 4px 0;
  font-family: 'Lexend Deca', sans-serif;
  font-size: 15px;
  color: #9090A0;
  cursor: pointer;
  touch-action: manipulation;
  justify-self: end;
}

/* ── Slide ── */
.ob-slide {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 0 12px;
  min-height: 0;
}

.ob-illus {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px 8px;
}
.ob-illus svg {
  width: 100%;
  max-width: 340px;
  height: auto;
}

.ob-content {
  padding: 8px 28px 0;
  margin-top: 1rem;
}

.ob-label {
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 1.4px;
  color: #7C5CBF;
  margin: 0 0 10px;
  text-transform: uppercase;
}

.ob-heading {
  font-size: clamp(28px, 8vw, 36px);
  font-weight: 500;
  line-height: 1.18;
  color: #1A1A2E;
  margin: 0 0 14px;
}
.ob-heading em {
  font-style: italic;
  color: #7C5CBF;
}

.ob-body {
  font-size: 15px;
  font-weight: 300;
  line-height: 1.6;
  color: #555566;
  margin: 0;
}

/* ── Footer ── */
.ob-footer {
  flex-shrink: 0;
  padding: 12px 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.ob-btn {
  background: #7C5CBF;
  color: white;
  border: none;
  border-radius: 16px;
  padding: 18px 24px;
  font-family: 'Lexend Deca', sans-serif;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  transition: background 0.15s, transform 0.1s;
  width: 100%;
}
.ob-btn:active {
  background: color-mix(in srgb, #7C5CBF 80%, #000);
  transform: scale(0.98);
}

.ob-login {
  text-align: center;
  font-size: 14px;
  color: #777788;
  margin: 0;
}
.ob-login a {
  color: #7C5CBF;
  font-weight: 600;
  text-decoration: none;
}

/* ── Piece pop-in animations ── */
.piece {
  transform-box: fill-box;
  transform-origin: center;
  animation: piecePop 0.48s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.piece-1 { animation-delay: 0.12s; }
.piece-3 { animation-delay: 0.36s; }
.piece-2 { animation-delay: 0.60s; }
.piece-4 { animation-delay: 0.84s; }

@keyframes piecePop {
  from { opacity: 0; transform: scale(0.3); }
  to   { opacity: 1; transform: scale(1); }
}

/* ── Slide transition ── */
.ob-slide-enter-active,
.ob-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.ob-slide-enter-from {
  opacity: 0;
  transform: translateX(32px);
}
.ob-slide-leave-to {
  opacity: 0;
  transform: translateX(-32px);
}
</style>
