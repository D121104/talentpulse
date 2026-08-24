# Frontend Design & Implementation Workflow

Follow this structured 4-step workflow on every UI task to guarantee distinctive, high-performance, and bug-free interfaces.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DESIGN PLAN & TOKEN SELECTION                            │
│ • Ground in subject matter & define 1 signature element     │
│ • Select curated 4-6 hex palette (light + dark mode)        │
│ • Select font pairings (Display + Clean Body)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. AVOID GENERIC AI SLOP (Self-Critique Phase)              │
│ • Reject default purple gradients / generic cream serifs    │
│ • Commit to an intentional aesthetic (e.g. Bento, 3D Hero) │
│ • Plan interactive moments (Shimmer, Aurora, Tilt)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CODE IMPLEMENTATION WITH DEPTH & MOTION                  │
│ • Build semantic HTML5 & responsive Tailwind layout         │
│ • Implement CSS motion keyframes & GPU-accelerated transforms│
│ • Integrate vector SVG icons (Lucide / Heroicons only)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. PRE-DELIVERY QUALITY AUDIT                               │
│ • Zero horizontal scrollbar on mobile screens               │
│ • Touch targets >= 44x44pt; cursor-pointer on all web CTAs  │
│ • Contrast ratio >= 4.5:1 (WCAG AA compliant)               │
│ • Active voice copy, no broken labels, zero emojis as icons │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Design Plan & Tokens
- Identify the single primary purpose of the page/component.
- Define design tokens:
  - **Colors**: Primary, Secondary, Background, Surface, Accent, Border.
  - **Typography**: Display font (bold, tight tracking) + Body font (clean, legible).
  - **Signature Element**: 1 memorable visual feature (e.g. 3D perspective hero, animated aurora gradient, bento spotlight).

## Step 2: Self-Critique
- Compare the planned design against standard generic templates.
- Ensure the layout conveys real information rather than superficial filler.
- Check if animations serve the user experience rather than causing distraction or dizziness.

## Step 3: Implementation
- Follow the recipes in [ANIMATIONS-AND-INTERACTIONS.md](file:///.agents/skills/frontend/ANIMATIONS-AND-INTERACTIONS.md).
- Use Tailwind CSS variables or vanilla CSS tokens for smooth theming.
- Add proper loading skeletons, empty states, and error feedback.

## Step 4: Quality Audit
- Test viewports: 375px (Mobile), 768px (Tablet), 1024px (Laptop), 1440px (Desktop).
- Verify all checkboxes in [RULES.md](file:///.agents/skills/frontend/RULES.md) before finishing.
