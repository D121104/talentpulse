# Frontend & Mobile Design Rules (Pro Max Standard)

This document defines the non-negotiable rules and quality standards for all frontend and mobile UI/UX implementations in this repository.

---

## 1. Aesthetic Excellence & Distinctive Identity (Castify-Grade UI)

Every page and screen must look polished, intentional, and memorable—never like generic AI-generated templates.

### A. The Thesis Hero & 3D Perspective
- **Hero as Thesis**: The top of the page must make a bold visual statement within 3 seconds.
- **3D Perspective Mockups**: When showcasing product previews, dashboards, or mobile screens:
  - Use 3D container perspective: `perspective: 2000px; transform-style: preserve-3d;`
  - Subtle angle tilt: `rotateX(16deg) rotateZ(-3deg) translateY(12px) scale(0.96);`
  - Deep layered shadows: `shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]`
  - Safari/App frame mockup with window control dots and refined borders (`border-gray-200/80` or `border-white/10`).
- **Aurora Gradient & Shimmer Effects**:
  - Use animated text gradients (`animate-aurora`) with 200% background size for hero keywords.
  - Interactive Shimmer buttons with rotating conic gradients for primary Call-To-Action.

### B. Bento Grid Layouts
- Organize features and data into asymmetric Bento grids (`lg:grid-cols-12`, `col-span-7` / `col-span-5`).
- Use large organic border radius (`rounded-[24px]` to `rounded-[32px]`).
- Backdrop surfaces with subtle borders (`border-gray-200/60` on light, `border-white/10` on dark) and hover spotlight glows.

### C. Motion & Infinite Smooth Scroll
- **Infinite Marquee**: For brand logos, trusted badges, or tags:
  - Linear seamless translation with `pause-on-hover`.
  - Gradient mask on left and right edges (`bg-gradient-to-r from-background`) to avoid abrupt cutoffs.
- **Scroll-Triggered Reveals**:
  - Reveal elements progressively with staggered opacity & translate (`translateY(24px)` -> `translateY(0)`).
  - Micro-blur in reveals (`filter: blur(8px)` -> `blur(0)`).

---

## 2. Strict UI Rules & Anti-Patterns (UI-UX Pro Max Checklist)

| Category | Standard (DO) | Anti-Pattern (AVOID) |
| :--- | :--- | :--- |
| **Icons** | Use vector SVG icons only (Lucide, Heroicons, @expo/vector-icons) with uniform stroke width (1.5px or 2px). | **NEVER** use emojis (🚀, 🎨, 💡) as navigation or system icons. |
| **Touch Targets** | Minimum **44×44pt** (iOS) / **48×48dp** (Android) / **24×24px** (Web pointer). Always add `cursor-pointer` on web. | Small clickable areas, missing hover/pressed feedback. |
| **Color Contrast** | Minimum **4.5:1** contrast ratio for body text (WCAG AA). Use semantic tokens (`hsl(var(--primary))`). | Gray text on gray background, raw uncurated hex codes scattered across components. |
| **Focus States** | Visible focus indicator (2px ring with offset) for all interactive elements. | `outline: none` without replacement. |
| **Layout Stability** | Reserve explicit dimensions or `aspect-ratio` for images/media to ensure **CLS = 0**. | Layout jumps, content shifting on hover/press. |
| **Responsive** | Mobile-first design tested at 375px, 768px, 1024px, 1440px. Use `min-h-dvh` instead of `100vh`. | Horizontal scroll on mobile, fixed px container widths. |
| **Typography** | Clear hierarchy: Display (font-extrabold, tracking tight), Body (16px base, leading-relaxed). Pair 1 characterful display with 1 clean body face. | Tiny text (<12px), unstyled browser default fonts, random weight mixing. |
| **Animation Timing** | 150ms-300ms transitions with spring or `cubic-bezier(0.16, 1, 0.3, 1)`. Respect `prefers-reduced-motion`. | Jittery layout-shifting transforms, overlong sluggish animations (>600ms). |

---

## 3. Pre-Delivery Audit Checklist

Before considering any UI task complete, verify every item below:

- [ ] **No Emojis as UI Icons**: All navigation, actions, and features use SVG vector icons.
- [ ] **Cursor & Touch Affordance**: `cursor-pointer` on all clickable web elements; touch targets $\ge 44\text{pt}$.
- [ ] **Active & Press States**: Buttons and cards respond with subtle spring scale (`active:scale-95`) or elevation within 100ms.
- [ ] **Viewport & Overflow**: Zero horizontal scrollbar on mobile screens; sticky headers reserve correct content offset.
- [ ] **Accessibility (WCAG AA)**: Text contrast passes 4.5:1; interactive buttons have accessible aria-labels; keyboard navigation works.
- [ ] **Content & Copy**: Active voice verbs ("Apply now", "Upload CV", "View company"), no placeholder lorem ipsum.
- [ ] **Dark Mode / Theming**: Seamless contrast in both light and dark modes with dedicated semantic CSS variables.
