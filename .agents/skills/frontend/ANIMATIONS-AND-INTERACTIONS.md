# Animation & Interaction Recipes (Castify & Fluid Motion Standards)

This reference contains production-ready motion patterns, CSS keyframes, and interaction recipes to build fluid, premium interfaces.

---

## 1. Aurora Gradient Headline
Animates vibrant gradient text infinitely with smooth linear color blending:

```css
@keyframes aurora {
  from { background-position: 0% 50%; }
  to { background-position: -200% 50%; }
}

.animate-aurora {
  background-image: linear-gradient(
    to right,
    #ff385c,
    #ff8fa3,
    #ff0080,
    #ff385c,
    #ff385c
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: aurora 8s linear infinite;
}
```

---

## 2. Shimmer Border CTA Button
Creates a luxury rotating light shimmer around button borders with inset depth:

```html
<a 
  style="--shimmer-color: #ff385c; --radius: 12px; --bg: #ffffff"
  class="group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border px-6 py-3.5 [background:var(--bg)] [border-radius:var(--radius)] transform-gpu transition-all duration-300 active:scale-95 border-gray-200/80 shadow-sm text-gray-900 font-bold"
  href="#"
>
  <!-- Rotating Shimmer Glow -->
  <div class="-z-30 blur-[2px] absolute inset-0 overflow-visible [container-type:size]">
    <div class="absolute inset-0 h-[100cqh] animate-shimmer [aspect-ratio:1] [background:conic-gradient(from_0deg_at_50%_50%,transparent_0,var(--shimmer-color)_0.15,transparent_0.25)] [margin-left:-50%] [mask-image:radial-gradient(80%_50%_at_50%_50%,#000_linear-gradient(#000,#000))]"></div>
  </div>

  <!-- Content -->
  <span class="relative z-10 flex items-center gap-2">Get Started Now</span>

  <!-- Inset Shadow Layer -->
  <div class="absolute inset-0 rounded-[var(--radius)] shadow-[inset_0_-4px_8px_rgba(0,0,0,0.06)] group-hover:shadow-[inset_0_-6px_12px_rgba(0,0,0,0.12)] transition-all duration-300"></div>
</a>
```

---

## 3. 3D Perspective Browser & App Mockup
Displays product screenshots and dashboards in high-impact 3D depth:

```html
<div class="w-full max-w-[1050px] mx-auto [perspective:2000px] z-10">
  <div 
    class="w-full origin-bottom transform-gpu transition-all duration-700 hover:rotate-0 hover:scale-100"
    style="transform-style: preserve-3d; transform: translateY(20px) scale(0.96) rotateX(16deg) rotateZ(-3deg);"
  >
    <div class="relative w-full rounded-[24px] bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-white/10 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.18)] overflow-hidden">
      
      <!-- Window Safari Header Bar -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-md">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-red-400"></div>
          <div class="w-3 h-3 rounded-full bg-amber-400"></div>
          <div class="w-3 h-3 rounded-full bg-emerald-400"></div>
        </div>
        <div class="flex items-center gap-2 px-6 py-1 rounded-full bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700 text-xs text-gray-500 font-mono">
          <span>recruitment.app/dashboard</span>
        </div>
        <div class="w-10"></div>
      </div>

      <!-- App Screen Content -->
      <div class="p-6">
        <!-- Render App Preview -->
      </div>
    </div>
  </div>
</div>
```

---

## 4. Infinite Smooth Marquee with Edge Mask
Smooth infinite sliding ticker with subtle edge fading:

```html
<div class="relative flex w-full flex-col items-center justify-center overflow-hidden">
  <div class="group flex gap-8 overflow-hidden [gap:2rem] flex-row pause-on-hover [--duration:35s]">
    <div class="flex shrink-0 justify-around gap-8 animate-marquee flex-row">
      <!-- Item list (Repeat twice for continuous seamless loop) -->
    </div>
    <div class="flex shrink-0 justify-around gap-8 animate-marquee flex-row" aria-hidden="true">
      <!-- Duplicate Item list -->
    </div>
  </div>

  <!-- Left & Right Gradient Mask -->
  <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white dark:from-gray-950"></div>
  <div class="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white dark:from-gray-950"></div>
</div>
```

---

## 5. Bento Grid Spotlight Hover Effect
Cards in Bento grids reveal a subtle radial light following the cursor or glowing on hover:

```html
<div class="group relative rounded-[32px] border border-gray-200/70 dark:border-white/10 bg-white dark:bg-gray-900/60 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]">
  <!-- Subtle Radial Gradient Spotlight on Hover -->
  <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

  <div class="relative z-10">
    <div class="w-12 h-12 rounded-[16px] bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform duration-300">
      <!-- SVG Icon -->
    </div>
    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Smart Feature</h3>
    <p class="text-gray-600 dark:text-gray-400 leading-relaxed">Description with clear typographic hierarchy.</p>
  </div>
</div>
```
