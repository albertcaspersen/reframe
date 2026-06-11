<script setup>
import { ref, computed } from 'vue'

const emit = defineEmits(['done'])

const step = ref(0)
const TOTAL = 3
const fwd = ref(true)
const transName = computed(() => fwd.value ? 'sl-fwd' : 'sl-bck')

const SCRAP = 'M34 52 C24 40,66 24,98 30 C140 38,188 18,226 32 C262 45,276 70,266 108 C258 142,274 172,242 190 C204 210,120 204,80 196 C42 188,16 166,24 124 C30 92,24 64,34 52 Z'

function go(n) {
  fwd.value = n > step.value
  step.value = Math.max(0, Math.min(TOTAL - 1, n))
}
function next() { step.value < TOTAL - 1 ? go(step.value + 1) : emit('done') }
function skip() { emit('done') }

const tx = ref(null)
function onTouchStart(e) { tx.value = e.touches[0].clientX }
function onTouchEnd(e) {
  if (tx.value == null) return
  const dx = e.changedTouches[0].clientX - tx.value
  if (dx < -50 && step.value < TOTAL - 1) go(step.value + 1)
  else if (dx > 50 && step.value > 0) go(step.value - 1)
  tx.value = null
}
</script>

<template>
  <div class="ob-wrap" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">

    <!-- Top bar -->
    <div class="ob-topbar">
      <div class="ob-dots">
        <button
          v-for="k in TOTAL" :key="k"
          class="ob-dot" :class="{ active: k - 1 === step }"
          @click="go(k - 1)"
        />
      </div>
      <img src="/logo/TekstiloLogo.svg" class="ob-logo" alt="Tekstilo" />
      <button
        class="ob-skip"
        :style="{ visibility: step === TOTAL - 1 ? 'hidden' : 'visible' }"
        @click="skip"
      >Spring over</button>
    </div>

    <!-- Slides -->
    <Transition :name="transName" mode="out-in">

      <!-- ── SLIDE 1: Problemet ── -->
      <div v-if="step === 0" key="s0" class="ob-slide">
        <div class="ob-illus">
          <svg viewBox="0 0 300 250" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <pattern id="w1" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
                <rect width="11" height="11" fill="oklch(0.74 0.07 300)"/>
                <line x1="0" y1="0" x2="0" y2="11" stroke="oklch(0.62 0.09 300)" stroke-width="2"/>
              </pattern>
              <pattern id="w1x" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="14" stroke="oklch(0.84 0.05 300)" stroke-width="1"/>
              </pattern>
              <clipPath id="w1c">
                <path :d="SCRAP"/>
              </clipPath>
            </defs>
            <path :d="SCRAP" fill="url(#w1)"/>
            <path :d="SCRAP" fill="url(#w1x)"/>
            <path :d="SCRAP" fill="none" stroke="oklch(0.42 0.10 300)" stroke-width="1.5" stroke-opacity="0.5"/>
            <g clip-path="url(#w1c)">
              <rect x="60" y="78" width="78" height="56" rx="6"
                fill="white" fill-opacity="0.82"
                stroke="oklch(0.42 0.10 300)" stroke-width="1.4" stroke-dasharray="4 3"/>
              <circle cx="108" cy="150" r="22"
                fill="white" fill-opacity="0.82"
                stroke="oklch(0.42 0.10 300)" stroke-width="1.4" stroke-dasharray="4 3"/>
            </g>
            <g class="anim-bad">
              <rect x="200" y="150" width="92" height="64" rx="6"
                fill="oklch(0.94 0.05 55)" fill-opacity="0.95"
                stroke="oklch(0.62 0.16 45)" stroke-width="1.6" stroke-dasharray="5 3"/>
              <line x1="206" y1="156" x2="286" y2="208"
                stroke="oklch(0.62 0.16 45)" stroke-width="1.6" stroke-opacity="0.6"/>
            </g>
            <g transform="translate(232 44)">
              <g class="anim-q">
                <circle r="26" fill="white" stroke="oklch(0.90 0.012 300)" stroke-width="1.5"/>
                <text x="0" y="9" text-anchor="middle"
                  font-family="'Lexend Deca', sans-serif"
                  font-size="32" font-style="italic"
                  fill="oklch(0.44 0.15 298)">?</text>
              </g>
            </g>
          </svg>
        </div>
        <div class="ob-content">
          <p class="ob-eyebrow">Problemet</p>
          <h1 class="ob-heading">Er der overhovedet plads nok?</h1>
          <p class="ob-body">Få afklaret om din stofrest kan rumme projektet, inden du bruger tid på klippeplan</p>
        </div>
      </div>

      <!-- ── SLIDE 2: Sådan virker det ── -->
      <div v-else-if="step === 1" key="s1" class="ob-slide">
        <div class="ob-illus">
          <svg viewBox="0 0 300 250" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <pattern id="w2" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
                <rect width="11" height="11" fill="oklch(0.76 0.06 300)"/>
                <line x1="0" y1="0" x2="0" y2="11" stroke="oklch(0.64 0.08 300)" stroke-width="2"/>
              </pattern>
              <pattern id="w2x" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="14" stroke="oklch(0.86 0.04 300)" stroke-width="1"/>
              </pattern>
              <clipPath id="w2c">
                <path :d="SCRAP"/>
              </clipPath>
            </defs>
            <path :d="SCRAP" fill="url(#w2)"/>
            <path :d="SCRAP" fill="url(#w2x)"/>
            <path class="anim-trace" :d="SCRAP" fill="none"
              stroke="oklch(0.42 0.12 300)" stroke-width="2.4" stroke-linecap="round"/>
            <rect class="anim-tick" :style="{ animationDelay: '1.10s' }" x="31" y="49" width="6" height="6" rx="1" fill="oklch(0.42 0.12 300)"/>
            <rect class="anim-tick" :style="{ animationDelay: '1.18s' }" x="223" y="29" width="6" height="6" rx="1" fill="oklch(0.42 0.12 300)"/>
            <rect class="anim-tick" :style="{ animationDelay: '1.26s' }" x="263" y="105" width="6" height="6" rx="1" fill="oklch(0.42 0.12 300)"/>
            <rect class="anim-tick" :style="{ animationDelay: '1.34s' }" x="239" y="187" width="6" height="6" rx="1" fill="oklch(0.42 0.12 300)"/>
            <rect class="anim-tick" :style="{ animationDelay: '1.42s' }" x="77" y="193" width="6" height="6" rx="1" fill="oklch(0.42 0.12 300)"/>
            <rect class="anim-tick" :style="{ animationDelay: '1.50s' }" x="21" y="121" width="6" height="6" rx="1" fill="oklch(0.42 0.12 300)"/>
            <g clip-path="url(#w2c)">
              <g class="anim-piece p1">
                <rect x="56" y="74" width="84" height="58" rx="6"
                  fill="white" fill-opacity="0.9"
                  stroke="oklch(0.42 0.10 300)" stroke-width="1.4" stroke-dasharray="4 3"/>
                <text x="98" y="107" text-anchor="middle"
                  font-family="'Lexend Deca', sans-serif"
                  font-size="9" fill="oklch(0.60 0.012 290)">FORSTK.</text>
              </g>
              <g class="anim-piece p2">
                <path d="M150 80 q40 -6 50 28 q8 30 -22 40 q-34 8 -34 -28 q0 -34 6 -40 Z"
                  fill="white" fill-opacity="0.9"
                  stroke="oklch(0.42 0.10 300)" stroke-width="1.4" stroke-dasharray="4 3"/>
                <text x="168" y="120" text-anchor="middle"
                  font-family="'Lexend Deca', sans-serif"
                  font-size="9" fill="oklch(0.60 0.012 290)">ÆRME</text>
              </g>
              <g class="anim-piece p3">
                <rect x="64" y="142" width="62" height="44" rx="6"
                  fill="white" fill-opacity="0.9"
                  stroke="oklch(0.42 0.10 300)" stroke-width="1.4" stroke-dasharray="4 3"/>
                <text x="95" y="167" text-anchor="middle"
                  font-family="'Lexend Deca', sans-serif"
                  font-size="9" fill="oklch(0.60 0.012 290)">LOMME</text>
              </g>
              <g class="anim-piece p4">
                <rect x="176" y="150" width="74" height="36" rx="6"
                  fill="white" fill-opacity="0.9"
                  stroke="oklch(0.42 0.10 300)" stroke-width="1.4" stroke-dasharray="4 3"/>
                <text x="213" y="172" text-anchor="middle"
                  font-family="'Lexend Deca', sans-serif"
                  font-size="9" fill="oklch(0.60 0.012 290)">KRAVE</text>
              </g>
            </g>
            <g transform="translate(232 206)">
              <g class="anim-pass">
                <rect x="-58" y="-19" width="116" height="38" rx="19" fill="oklch(0.58 0.13 155)"/>
                <g transform="translate(-42 -3)">
                  <polyline points="0,2 6,10 20,-4"
                    stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </g>
                <text x="16" y="5" text-anchor="middle"
                  font-family="'Lexend Deca', sans-serif"
                  font-size="14" font-weight="600" fill="white">Passer</text>
              </g>
            </g>
          </svg>
        </div>
        <div class="ob-content">
          <p class="ob-eyebrow">Sådan virker det</p>
          <h1 class="ob-heading">Scan stoffet — vi placerer delene</h1>
          <p class="ob-body">Tag et billede af din stofrest. Appen placerer mønsterdelene, så du straks ved om de passer.</p>
        </div>
      </div>

      <!-- ── SLIDE 3: Ugentlige mønstre ── -->
      <div v-else key="s2" class="ob-slide">
        <div class="ob-illus">
          <svg viewBox="0 0 300 250" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <!-- Card 1 — warm orange, tilted left -->
            <g transform="translate(70 86) rotate(-11 55 70)">
              <rect x="8" y="0" width="94" height="128" rx="12" fill="white" stroke="oklch(0.90 0.012 300)" stroke-width="1.5"/>
              <rect x="18" y="12" width="74" height="74" rx="8" fill="oklch(0.80 0.10 75)"/>
              <path d="M40 30 C40 20 70 20 70 30 L74 78 L36 78 Z" transform="translate(15 16) scale(0.78)"
                fill="none" stroke="oklch(0.55 0.14 50)" stroke-width="2" stroke-linejoin="round"/>
              <rect x="18" y="96" width="52" height="7" rx="3.5" fill="oklch(0.90 0.012 300)"/>
              <rect x="18" y="108" width="34" height="6" rx="3" fill="oklch(0.93 0.01 300)"/>
            </g>
            <!-- Card 2 — teal, upright -->
            <g transform="translate(110 86)">
              <rect x="8" y="0" width="94" height="128" rx="12" fill="white" stroke="oklch(0.90 0.012 300)" stroke-width="1.5"/>
              <rect x="18" y="12" width="74" height="74" rx="8" fill="oklch(0.62 0.10 200)"/>
              <path d="M55 24 C33 24 35 58 35 58 L75 58 C75 58 77 24 55 24 Z M22 58 L88 58 L84 68 L26 68 Z" transform="translate(15 16) scale(0.78)"
                fill="none" stroke="oklch(0.40 0.12 210)" stroke-width="2" stroke-linejoin="round"/>
              <rect x="18" y="96" width="52" height="7" rx="3.5" fill="oklch(0.90 0.012 300)"/>
              <rect x="18" y="108" width="34" height="6" rx="3" fill="oklch(0.93 0.01 300)"/>
            </g>
            <!-- Card 3 — dark plum, tilted right -->
            <g transform="translate(150 86) rotate(11 55 70)">
              <rect x="8" y="0" width="94" height="128" rx="12" fill="white" stroke="oklch(0.90 0.012 300)" stroke-width="1.5"/>
              <rect x="18" y="12" width="74" height="74" rx="8" fill="oklch(0.45 0.08 245)"/>
              <path d="M40 26 L52 32 L64 26 L74 30 L78 44 L72 78 L38 78 L32 44 L36 30 Z" transform="translate(15 16) scale(0.78)"
                fill="none" stroke="oklch(0.70 0.06 245)" stroke-width="2" stroke-linejoin="round"/>
              <rect x="18" y="96" width="52" height="7" rx="3.5" fill="oklch(0.90 0.012 300)"/>
              <rect x="18" y="108" width="34" height="6" rx="3" fill="oklch(0.93 0.01 300)"/>
            </g>
            <!-- Uge 23 badge -->
            <g transform="translate(214 64)">
              <rect x="-52" y="-18" width="104" height="36" rx="18" fill="oklch(0.54 0.15 298)"/>
              <rect x="-42" y="-10" width="18" height="18" rx="3" fill="white" fill-opacity="0.25" stroke="white" stroke-width="1.5"/>
              <line x1="-38" y1="-10" x2="-38" y2="-13" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="-28" y1="-10" x2="-28" y2="-13" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="-42" y1="-4" x2="-24" y2="-4" stroke="white" stroke-width="1" stroke-opacity="0.5"/>
              <text x="14" y="5" text-anchor="middle"
                font-family="'Lexend Deca', sans-serif"
                font-size="13" font-weight="600" fill="white">Uge 23</text>
            </g>
          </svg>
        </div>
        <div class="ob-content">
          <p class="ob-eyebrow">Altid noget nyt</p>
          <h1 class="ob-heading">Nye mønstre hver uge</h1>
          <p class="ob-body">Hent friske mønsterdele til nye projekter hver uge — så har du altid en grund til at hive en rest frem og tjekke.</p>
        </div>
      </div>

    </Transition>

    <!-- Footer -->
    <div class="ob-footer">
      <button class="ob-btn" @click="next">
        <span>{{ step < TOTAL - 1 ? 'Videre' : 'Kom i gang' }}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="17" height="17">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      <p v-if="step === TOTAL - 1" class="ob-login">
        Har du allerede en konto?
        <button class="ob-login-btn" @click.prevent>Log ind</button>
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
  width: 56px;
  height: 56px;
  object-fit: contain;
}
.ob-dots {
  display: flex;
  gap: 6px;
  align-items: center;
}
.ob-dot {
  height: 4px;
  width: 16px;
  border-radius: 99px;
  border: 0;
  padding: 0;
  cursor: pointer;
  background: oklch(0.90 0.012 300);
  transition: width 280ms ease, background 280ms ease;
}
.ob-dot.active {
  width: 26px;
  background: oklch(0.54 0.15 298);
}
.ob-skip {
  background: none;
  border: none;
  padding: 4px 0;
  font-family: 'Lexend Deca', sans-serif;
  font-size: 13.5px;
  font-weight: 500;
  color: oklch(0.60 0.012 290);
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
  padding: 20px 24px 4px;
}
.ob-illus svg {
  width: 100%;
  max-width: 320px;
  height: auto;
  overflow: visible;
}
.ob-content {
  padding: 0 30px;
  margin-top: 14px;
  animation: fadeUp 0.45s ease-out 0.2s both;
}
.ob-eyebrow {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: oklch(0.54 0.15 298);
  margin: 0 0 12px;
}
.ob-heading {
  font-size: clamp(26px, 7.5vw, 34px);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.5px;
  color: oklch(0.22 0.015 290);
  margin: 0 0 14px;
}
.ob-heading em {
  font-style: italic;
  color: oklch(0.44 0.15 298);
}
.ob-body {
  font-size: 15px;
  font-weight: 300;
  line-height: 1.55;
  color: oklch(0.44 0.015 290);
  margin: 0;
}

/* ── Footer ── */
.ob-footer {
  flex-shrink: 0;
  padding: 8px 24px 36px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ob-btn {
  background: oklch(0.54 0.15 298);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 16px 24px;
  font-family: 'Lexend Deca', sans-serif;
  font-size: 15.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
  cursor: pointer;
  touch-action: manipulation;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.15s;
}
.ob-btn:active { opacity: 0.85; }
.ob-login {
  text-align: center;
  font-size: 13px;
  color: oklch(0.60 0.012 290);
  margin: 0;
}
.ob-login-btn {
  background: none;
  border: none;
  padding: 0;
  font-family: 'Lexend Deca', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: oklch(0.54 0.15 298);
  cursor: pointer;
}

/* ── Keyframes ── */
@keyframes drawTrace {
  from { stroke-dashoffset: 920; }
  to   { stroke-dashoffset: 0; }
}
@keyframes popIn {
  0%   { opacity: 0; transform: scale(0.6); }
  60%  { transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-14px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Slide 1 animations ── */
.anim-bad { animation: fadeUp 0.5s ease-out 0.3s both; }
.anim-q {
  transform-box: fill-box;
  transform-origin: center;
  animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both;
}

/* ── Slide 2 animations ── */
.anim-trace {
  stroke-dasharray: 920;
  animation: drawTrace 1.1s ease-out both;
}
.anim-tick {
  opacity: 0;
  animation: popIn 0.3s ease-out both;
}
.anim-piece {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
}
.p1 { animation: dropIn 0.4s ease-out 1.3s both; }
.p2 { animation: dropIn 0.4s ease-out 1.5s both; }
.p3 { animation: dropIn 0.4s ease-out 1.7s both; }
.p4 { animation: dropIn 0.4s ease-out 1.9s both; }
.anim-pass {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: popIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 2.2s both;
}

/* ── Slide transitions ── */
.sl-fwd-enter-active, .sl-fwd-leave-active,
.sl-bck-enter-active, .sl-bck-leave-active {
  transition: opacity 0.22s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.sl-fwd-enter-from { opacity: 0; transform: translateX(40px); }
.sl-fwd-leave-to   { opacity: 0; transform: translateX(-40px); }
.sl-bck-enter-from { opacity: 0; transform: translateX(-40px); }
.sl-bck-leave-to   { opacity: 0; transform: translateX(40px); }
</style>
