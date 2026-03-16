# Mobile & Responsive Guidelines

All features must work on mobile (375px+). Use **mobile-first** Tailwind classes and test at iPhone SE width (375px) in Chrome DevTools.

## Viewport Configuration

The `viewport` export in `src/app/(web)/layout.tsx` must include `width: "device-width"` and `initialScale: 1`:

```typescript
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
}
```

## Responsive Hook

Use `useIsMobile()` from `@/hooks/use-mobile` when component **behavior** must change by screen size (e.g., Recharts prop values, conditional rendering). For **layout-only** changes, use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`).

```typescript
import { useIsMobile } from '@/hooks/use-mobile';
const isMobile = useIsMobile(); // true when viewport < 768px (md breakpoint)
```

## Padding & Spacing

| Context | Classes | Rationale |
|---------|---------|-----------|
| Page containers | `p-4 sm:p-6 lg:p-8` | Never `p-8` alone — wastes 64px on a 375px screen |
| Page titles | `text-2xl sm:text-4xl` | `text-4xl` is too large for narrow screens |
| Dialog/modal content | Base is `p-4 sm:p-6` | Set in `dialog.tsx` base component |

## Tab Navigation

When tabs contain long labels (e.g., "New Volunteers In Process"), they overflow on narrow screens. Use responsive classes:

```tsx
<TabsList className="w-full sm:w-fit h-auto">
  <TabsTrigger value="tab1" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
    Long Tab Label
  </TabsTrigger>
</TabsList>
```

| Class | Purpose |
|-------|---------|
| `w-full sm:w-fit` on TabsList | Full-width on mobile, auto-sized on desktop |
| `h-auto` on TabsList | Allows multi-line tab labels to expand height |
| `flex-1 sm:flex-initial` on TabsTrigger | Equal-width tabs on mobile, auto-sized on desktop |
| `whitespace-normal sm:whitespace-nowrap` | Wraps text on mobile, single line on desktop |
| `text-xs sm:text-sm` | Smaller text on mobile to fit labels |

## Form Select Elements

Native `<select>` elements must use `text-base` (16px) on mobile to **prevent iOS Safari auto-zoom** on focus. Browsers zoom when input font size is below 16px.

```tsx
<select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm ...">
```

| Pattern | Implementation |
|---------|---------------|
| **Font size** | `text-base sm:text-sm` — 16px on mobile (prevents iOS zoom), 14px on desktop |
| **Height** | `h-10` (40px) — matches touch-friendly sizing guidelines |

## Chart Standards (Recharts)

All chart components must follow these mobile patterns:

| Pattern | Implementation |
|---------|---------------|
| **Touch-friendly tooltips** | `<Tooltip trigger={isMobile ? 'click' : 'hover'} />` — tap to show, tap elsewhere to dismiss |
| **Tooltip max-width** | Add `maxWidth: '85vw'` to `contentStyle` — prevents tooltip from exceeding viewport |
| **Tooltip dismiss on outside tap** | Handled by `ExpandableChart` wrapper — tapping outside the chart forces a re-mount via React key toggle to clear Recharts' internal tooltip state |
| **Responsive margins** | `margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? 5 : 20, bottom: 5 }}` |
| **Hide legend on mobile** | `{!isMobile && <Legend />}` — lines are identifiable by color; legend wastes vertical space |
| **Hide secondary Y-axis** | For dual-axis charts: `{!isMobile && <YAxis yAxisId="right" ... />}` |
| **Hide pie chart labels** | `label={isMobile ? false : renderLabel}` — labels overlap on small screens |
| **Horizontal bar Y-axis width** | `width={isMobile ? 80 : 150}` — 150px is 40% of a 375px screen |
| **Empty state heights** | Use `style={{ height }}`, **not** `` h-[${height}px] `` — Tailwind can't compile dynamic values |

**ExpandableChart wrapper** (`src/components/dashboard/expandable-chart.tsx`): All dashboard charts are wrapped in this component. On mobile, click-to-expand on the chart area is disabled to avoid intercepting Recharts' click-triggered tooltips — users tap the expand icon button instead. The wrapper also handles tooltip dismiss: a `pointerdown` listener on `document` detects taps outside the chart container and increments a React key to force the chart to re-mount, clearing the tooltip. Do **not** try to dismiss tooltips via Recharts' `onClick` prop or `active` prop override — these interfere with Recharts' internal tooltip state management.

## Dialog & Modal Standards

| Pattern | Implementation |
|---------|---------------|
| **Base padding** | `p-4 sm:p-6` (set in `dialog.tsx`) |
| **Wide modals (max-w-2xl)** | Add `w-[calc(100vw-1rem)]` before `sm:max-w-2xl` to prevent overflow |
| **Modal close button** | Base `DialogContent` includes an X button at `right-4 top-4` — always accessible |

## Form Layout Standards

| Pattern | Implementation |
|---------|---------------|
| **Side-by-side fields** | `flex flex-col sm:flex-row` — stacks vertically on mobile |
| **Fixed-width inputs** | `w-full sm:w-36` — full width on mobile, fixed on desktop |
| **Badge/icon rows** | Always include `flex-wrap` — prevents horizontal overflow |

## Touch Interaction Standards

- **Never rely solely on `:hover`** for critical UI. Use `opacity-60 sm:opacity-0 sm:group-hover:opacity-100` for reveal buttons.
- **Interactive SVG elements** need `onClick` alongside `onMouseEnter`/`onMouseLeave` for tap support.
- **Recharts tooltips** must use `trigger={isMobile ? 'click' : 'hover'}` — default hover tooltips are unusable on touch devices.

## Anti-Patterns to Avoid

```typescript
// ❌ Dynamic Tailwind classes — won't be compiled
<div className={`h-[${height}px]`}>

// ✅ Use inline style for dynamic values
<div style={{ height }}>

// ❌ Fixed padding on all breakpoints
<div className="p-8">

// ✅ Mobile-first responsive padding
<div className="p-4 sm:p-6 lg:p-8">

// ❌ Wide modal without mobile constraint
<DialogContent className="max-w-2xl">

// ✅ Viewport-aware modal width
<DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl">

// ❌ Fixed Y-axis width on horizontal bar chart
<YAxis width={150} />

// ✅ Responsive Y-axis width
<YAxis width={isMobile ? 80 : 150} />

// ❌ Hover-only button visibility
className="opacity-0 group-hover:opacity-100"

// ✅ Touch-friendly visibility
className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100"

// ❌ Small select font (causes iOS auto-zoom)
<select className="text-xs">
<select className="text-sm">

// ✅ 16px base prevents iOS auto-zoom, smaller on desktop
<select className="text-base sm:text-sm h-10">

// ❌ Fixed-width tabs that overflow on mobile
<TabsList>
  <TabsTrigger>Long Tab Label Here</TabsTrigger>
</TabsList>

// ✅ Responsive tabs that wrap and fit mobile
<TabsList className="w-full sm:w-fit h-auto">
  <TabsTrigger className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
    Long Tab Label Here
  </TabsTrigger>
</TabsList>

// ❌ Trying to dismiss Recharts tooltips via onClick/active prop
<BarChart onClick={() => setActive(false)}>
  <Tooltip active={active} />
</BarChart>

// ✅ Let ExpandableChart handle tooltip dismiss via key toggle
// (no extra code needed in individual chart components)
```
