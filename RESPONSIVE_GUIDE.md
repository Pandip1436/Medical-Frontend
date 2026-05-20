# Responsive Design Guide — Hospital Suppliers

This document is the single source of truth for how this app adapts to screen sizes. It reflects what's actually in `src/index.css` and the layout primitives in `src/components/layout/`.

---

## 1. Breakpoint System

Defined in `src/index.css` under `@theme`. Tailwind v4 reads `--breakpoint-*` tokens as the screen scale.

| Token | Min width | Pixels | Typical device                          |
| ----- | --------- | ------ | --------------------------------------- |
| `xs`  | 30rem     | 480px  | Small phones / narrow drawers (custom)  |
| `sm`  | 40rem     | 640px  | Large phones                            |
| `md`  | 48rem     | 768px  | Tablets (portrait)                      |
| `lg`  | 64rem     | 1024px | Tablets (landscape) / small laptops     |
| `xl`  | 80rem     | 1280px | Desktops                                |
| `2xl` | 96rem     | 1536px | Large desktops                          |
| `3xl` | 120rem    | 1920px | Ultra-wide / 4K (custom)                |

**Mobile-first.** Write the base style for mobile; layer `xs:` / `sm:` / `md:` / `lg:` overrides upward.

```tsx
// Stack on mobile, two columns from 480px up, four from 1024px up
<div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3">
```

---

## 2. Fluid Typography

Defined in `index.css` `@theme` — every `text-*` token uses `clamp()` so it scales between mobile min and desktop max without manual breakpoints.

| Token        | Mobile min | Desktop max | Use for                          |
| ------------ | ---------- | ----------- | -------------------------------- |
| `text-2xs`   | 10px       | 11px        | Badges, meta                     |
| `text-xs`    | 11px       | 12px        | Helper text                      |
| `text-sm`    | 12px       | 13px        | Secondary body                   |
| `text-base`  | 13px       | 14px        | Body (default)                   |
| `text-lg`    | 14px       | 16px        | Lead / large body                |
| `text-xl`    | 18px       | 22px        | Section titles                   |
| `text-2xl`   | 22px       | 28px        | Card / panel titles              |
| `text-3xl`   | 28px       | 40px        | Page titles / hero               |

Body sits at 13–14px depending on viewport, which is intentional for an information-dense ERP. **Do not** drop below `text-base` for primary content.

---

## 3. Fluid Spacing & Containers

Two fluid spacing tokens are available:

- `var(--space-section)` — page/section vertical rhythm (16px → 24px)
- `var(--space-card)` — card internal padding (12px → 20px)

Containers should not use raw px widths. Patterns to use:

- **Page wrapper** — `AppLayout`'s `<main>` provides padding (`p-3 pb-24 md:p-4 lg:p-6`). Page components don't need their own outer padding.
- **Content cap** — `.content-area` class is applied to the inner motion wrapper. It caps width at 1600px (≥1680px viewport) and 1800px (≥1920px viewport), and centers via `margin-inline: auto`. Use it for any full-bleed dashboard layout that should stop sprawling on 4K.
- **Card max-width** — use Tailwind's spacing scale (`max-w-md`, `max-w-2xl`, `max-w-5xl`) — never `max-w-[NNNpx]`.

---

## 4. Layout Shell

```
┌─────────────────────────────────────────────┐
│ Sidebar (desktop fixed-left, mobile sheet)   │
│ ┌─────────────────────────────────────────┐ │
│ │ Header (sticky top, h-14, hides on POS) │ │
│ ├─────────────────────────────────────────┤ │
│ │ <main>  ← scroll container               │ │
│ │   .content-area  ← max-width cap         │ │
│ │     <Page>                                │ │
│ └─────────────────────────────────────────┘ │
│ Mobile bottom-tab nav (fixed, h-16, only <md)│
└─────────────────────────────────────────────┘
```

- **Sidebar** (`src/components/layout/Sidebar.tsx`):
  - `< md` (767px): hidden by default, opens as a left sheet via the hamburger; closes on route change; swipe-to-dismiss. A bottom tab bar (4 role-aware tabs + "More" sheet) is always visible.
  - `≥ md`: fixed-left, 64px collapsed or 260px expanded; toggle with `[` key or footer button.
- **Header** (`src/components/layout/Header.tsx`):
  - Mobile shows hamburger + actions only; breadcrumbs, search pill, branch switcher, and language picker are `md:flex` / `hidden md:*`.
  - Notification bell, theme toggle, user menu are always visible.

---

## 5. Grid Patterns (do this)

### Form rows
```tsx
// Two-up on phones large enough, stack on smallest screens.
<div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
  <Field label="First name" />
  <Field label="Last name" />
</div>
```

### Stat / KPI strip
```tsx
// 2 → 3 → 6 columns as space allows. Mirrors DashboardPage row 1.
<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
  {tiles}
</div>
```

### 12-column page layout
```tsx
<div className="grid grid-cols-12 gap-4">
  <div className="col-span-12 lg:col-span-7">…</div>
  <div className="col-span-12 lg:col-span-5">…</div>
</div>
```

### Action footers (e.g. activity quick-log)
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
  {buttons}
</div>
```

---

## 6. Tables

Hospital Suppliers is data-dense. Tables with > 4 columns must allow horizontal scroll on small screens, never break layout.

```tsx
<div className="overflow-x-auto">
  <table className="w-full min-w-175">  {/* 700px floor */}
    …
  </table>
</div>
```

The `min-w-*` value should equal the table's natural width — that keeps the columns from collapsing on mobile and lets the parent's `overflow-x-auto` take over.

---

## 7. Side Drawers / Sheets

Use Radix Sheet via `@/components/ui/sheet`. Apply progressive max-widths so the drawer feels right at every size:

```tsx
<SheetContent
  side="right"
  className="w-full sm:max-w-160 lg:max-w-225 xl:max-w-300"
>
```

- `< sm` (640px): full-screen (`w-full`).
- `sm` → `lg`: 640px wide.
- `lg` → `xl`: 900px wide.
- `xl+`: 1200px wide.

**Don't** ship a single `sm:max-w-[1200px]` — at 1024px viewport the drawer takes over the whole screen, which feels heavy for what is meant to be a slide-over.

---

## 8. Modals / Dialogs

Use Radix Dialog. Mobile-friendly pattern:

```tsx
<DialogContent className="w-full max-w-lg sm:max-w-xl md:max-w-2xl p-4 sm:p-6 max-h-[90dvh] overflow-y-auto">
```

- Use `dvh` not `vh` so the iOS dynamic toolbar doesn't crop content.
- For full-screen-on-mobile pattern: `h-dvh max-w-none rounded-none md:h-auto md:max-w-2xl md:rounded-2xl`.

---

## 9. Touch & Pointer

- Minimum touch target is **44 × 44 px**. The button library's default `size="sm"` (`h-8`) is at 32px — bump to `size="default"` (h-9 → h-10) for primary mobile actions.
- Use `@media (hover: hover)` for hover-only effects. The base layer in `index.css` already forces `group-hover:opacity-100` styles to be visible on touch via `@media (hover: none)`, so you don't need to handle that manually.

---

## 10. Safe Area (iOS notch / Android nav bar)

Three helper classes are provided in `index.css`:

```tsx
<div className="pb-safe">…</div>   /* bottom padding ≥ env(safe-area-inset-bottom) */
<div className="pt-safe">…</div>
<div className="px-safe">…</div>
```

The mobile bottom-tab bar already uses `pb-[max(0px,env(safe-area-inset-bottom))]`.

---

## 11. Animation & Motion

All animations respect `prefers-reduced-motion: reduce` (base layer in `index.css` zeros out durations). Page transitions live in `AppLayout`'s `<AnimatePresence>` block with `pageVariants` — don't add page-level wrappers that re-animate on every route change.

---

## 12. Responsive QA Checklist

Before merging any UI change, walk through these viewport sizes:

**320 / 375 / 414 px — small phones**
- [ ] No horizontal scroll on the body
- [ ] All touch targets ≥ 44 × 44 px
- [ ] Forms stack to one column; numeric paired fields can stay two-up if each cell is ≥ 130 px wide
- [ ] Body text not below 13 px (the `text-base` floor)
- [ ] Bottom-tab nav not blocking content (use `pb-24` on scrollable pages)
- [ ] Hamburger sheet closes on route change

**768 / 1024 px — tablets**
- [ ] Sidebar transitions from sheet to fixed-left at md (768px)
- [ ] Two-column forms re-expand at sm (640px)
- [ ] Drawers fill ≤ 640 px wide, leaving page partially visible behind

**1280 / 1440 px — desktops**
- [ ] Multi-column dashboard layouts active
- [ ] Sidebar fully expanded (260 px) unless user collapsed it
- [ ] Drawers max out at 900–1200 px

**1920 px+ — large desktops / 4K**
- [ ] `.content-area` cap kicks in (≥ 1680px), content centered
- [ ] No oversized hero sections or stretched cards

**Global**
- [ ] Tables with > 4 columns wrapped in `overflow-x-auto`
- [ ] Dialogs use `dvh` not `vh` for height limits
- [ ] No raw px widths on containers (use Tailwind scale or fluid clamp)
- [ ] `prefers-reduced-motion` collapses animations (verify by enabling in OS)

---

## 13. Anti-patterns

| ❌ Don't                                    | ✅ Do                                          |
| ------------------------------------------- | ----------------------------------------------- |
| `style={{ width: 600 }}`                    | `className="max-w-xl"`                          |
| `grid-cols-5` on a stat row                  | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`     |
| `<table>` with no wrapper                    | `<div className="overflow-x-auto"><table .../>` |
| `min-h-[600px]`                              | `min-h-[60dvh]`                                 |
| `text-[10px]` on body copy                   | `text-xs` (clamps to 11–12 px)                  |
| `sm:max-w-[1200px]` (one cliff)              | `sm:max-w-160 lg:max-w-225 xl:max-w-300`        |
| Hiding actions on mobile with no alternative | Provide a `More` menu or moved-to-toolbar entry |

---

Last verified: 2026-05-20.
