/**
 * Unit tests for historyChartLayout — pure geometry/format/style helpers
 * extracted from ExerciseHistoryChart.tsx (finding M11, WP-16). The
 * component is a 'use client' module whose named exports cannot be
 * imported directly under a plain Node runtime (tsx's RSC-aware transform
 * rewrites 'use client' named exports into references), so per the packet
 * instructions the pure SVG-geometry/format/style logic is extracted here
 * and asserted directly; the component becomes a thin renderer over it.
 *
 * Scenario: history-chart-legibility (WP-16)
 * Run: node --import tsx --test .claude/test_history-chart-layout.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  fmtDate,
  buildChartLayout,
  buildChartSummary,
  LABEL_FONT_SIZE,
  AXIS_FONT_SIZE,
  REPS_STROKE_CLASS,
  WEIGHT_STROKE,
  LEGEND_TEXT_CLASS,
  AXIS_LABEL_CLASS,
} = await import('../src/lib/historyChartLayout.ts')

function pt(date, maxWeight, maxReps) {
  return { date, maxWeight, maxReps, totalVolume: null, setCount: 1 }
}

// ─── Legibility constants (finding M11) ────────────────────────────────────

test('data-label font size is >= 11 CSS px equivalent at the rendered viewBox scale', () => {
  // Chart is drawn in a `viewBox="0 0 300 140"` SVG stretched to `w-full`
  // (CSS px) — the SVG user-units map ~1:1 to CSS px at typical mobile
  // widths (300-400px container), so a raw fontSize of 9 (the old value)
  // renders illegibly small. Font sizes must be >= 11 in SVG user units.
  assert.ok(LABEL_FONT_SIZE >= 11, `LABEL_FONT_SIZE ${LABEL_FONT_SIZE} must be >= 11`)
  assert.ok(AXIS_FONT_SIZE >= 11, `AXIS_FONT_SIZE ${AXIS_FONT_SIZE} must be >= 11`)
})

test('reps stroke uses a mode-aware currentColor class, not a single hardcoded hex (a fixed hex cannot pass AA in both modes)', () => {
  // zinc-500 (#71717a) is 4.83:1 on white (passes light-mode AA text) but
  // only 3.67:1 on dark:bg-zinc-900 (#18181b, fails). zinc-400 (#a1a1aa) is
  // 6.91:1 on zinc-900 (passes) but only 2.56:1 on white (fails). No single
  // hex satisfies both, so the reps stroke must switch color with the
  // color-scheme via a `currentColor` stroke + Tailwind text-color class.
  assert.match(REPS_STROKE_CLASS, /text-zinc-(500|600)\b/, 'light-mode reps color must be >= zinc-500 to pass AA on white')
  assert.match(REPS_STROKE_CLASS, /dark:text-zinc-400\b/, 'dark-mode reps color must be zinc-400 (not zinc-500) to pass AA on dark:bg-zinc-900')
})

test('reps stroke class light-mode shade passes AA (>=4.5:1) against white', () => {
  const shade = REPS_STROKE_CLASS.match(/text-zinc-(\d+)\b/)?.[1]
  const hex = { '400': '#a1a1aa', '500': '#71717a', '600': '#52525b', '700': '#3f3f46' }[shade]
  assert.ok(hex, `unrecognized light shade zinc-${shade}`)
  const contrast = contrastRatio(hex, '#ffffff')
  assert.ok(contrast >= 4.5, `zinc-${shade} on white is ${contrast.toFixed(2)}, must be >= 4.5`)
})

test('reps stroke class dark-mode shade passes AA (>=4.5:1) against dark:bg-zinc-900 (#18181b)', () => {
  const shade = REPS_STROKE_CLASS.match(/dark:text-zinc-(\d+)\b/)?.[1]
  const hex = { '300': '#d4d4d8', '400': '#a1a1aa', '500': '#71717a' }[shade]
  assert.ok(hex, `unrecognized dark shade zinc-${shade}`)
  const contrast = contrastRatio(hex, '#18181b')
  assert.ok(contrast >= 4.5, `zinc-${shade} on #18181b is ${contrast.toFixed(2)}, must be >= 4.5`)
})

test('weight stroke stays orange (#f97316) — §5.2 must be unregressed', () => {
  assert.equal(WEIGHT_STROKE.toLowerCase(), '#f97316')
})

test('legend text class is an AA-compliant pairing, not the old zinc-400/zinc-600 combo', () => {
  // zinc-400 on dark:bg-zinc-900 passes (6.9:1); zinc-600 dark-mode text on
  // light bg is the light-mode leg and must also pass — assert the class
  // string names shades known to pass, as a proxy for the checked pairing.
  assert.match(LEGEND_TEXT_CLASS, /text-zinc-(500|600|700)\b/, 'light-mode legend shade must be >= zinc-500')
  assert.doesNotMatch(LEGEND_TEXT_CLASS, /dark:text-zinc-500\b/, 'dark-mode legend text must not be zinc-500 (fails AA)')
})

test('axis label class also avoids the AA-failing zinc-500 in dark mode', () => {
  assert.doesNotMatch(AXIS_LABEL_CLASS ?? '', /dark:text-zinc-500\b/)
})

// ─── fmtDate (pure, unchanged behaviour) ───────────────────────────────────

test('fmtDate renders a short month + day', () => {
  assert.equal(fmtDate('2026-01-05'), 'Jan 5')
  assert.equal(fmtDate('2026-12-31'), 'Dec 31')
})

// ─── buildChartLayout: geometry parity with checklist §5.2-§5.5 ───────────

test('buildChartLayout: two points with weight and reps produces both polylines in order', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-02-01', 65, 8)]
  const layout = buildChartLayout(points)
  assert.equal(layout.hasWeight, true)
  assert.equal(layout.hasReps, true)
  assert.ok(layout.weightPolyline.length > 0)
  assert.ok(layout.repsPolyline.length > 0)
  // first point's x precedes second point's x
  const [firstX] = layout.weightPolyline.split(' ')[0].split(',').map(Number)
  const [secondX] = layout.weightPolyline.split(' ')[1].split(',').map(Number)
  assert.ok(secondX > firstX)
})

test('buildChartLayout: weight-only exercise (no reps) omits the reps line/labels (§5.8)', () => {
  const points = [pt('2026-01-01', 60, null), pt('2026-02-01', 65, null)]
  const layout = buildChartLayout(points)
  assert.equal(layout.hasReps, false)
  assert.equal(layout.repsPolyline, '')
  assert.equal(layout.repsLabels.length, 0)
})

test('buildChartLayout: first/last weight labels carry the correct values and orange color (§5.3)', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-01-15', 62, 9), pt('2026-02-01', 65, 8)]
  const layout = buildChartLayout(points)
  assert.equal(layout.weightLabels.length, 2)
  assert.equal(layout.weightLabels[0].value, 60)
  assert.equal(layout.weightLabels[1].value, 65)
  for (const l of layout.weightLabels) {
    assert.equal(l.fill.toLowerCase(), '#f97316')
    assert.ok(l.fontSize >= 11)
  }
})

test('buildChartLayout: first/last reps labels carry correct values and a mode-aware (not fixed-zinc-500) color class (§5.4)', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-01-15', 62, 9), pt('2026-02-01', 65, 8)]
  const layout = buildChartLayout(points)
  assert.equal(layout.repsLabels.length, 2)
  assert.equal(layout.repsLabels[0].value, 10)
  assert.equal(layout.repsLabels[1].value, 8)
  for (const l of layout.repsLabels) {
    assert.equal(l.fill, 'currentColor')
    assert.match(l.className, /dark:text-zinc-400\b/)
    assert.doesNotMatch(l.className, /dark:text-zinc-500\b/)
    assert.ok(l.fontSize >= 11)
  }
})

test('buildChartLayout: single non-null weight/reps point still yields exactly one label each (first===last index)', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-02-01', null, null)]
  const layout = buildChartLayout(points)
  assert.equal(layout.weightLabels.length, 1)
  assert.equal(layout.repsLabels.length, 1)
})

test('buildChartLayout: x-axis shows first and last date text (§5.5)', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-01-15', 62, 9), pt('2026-02-01', 65, 8)]
  const layout = buildChartLayout(points)
  assert.equal(layout.xAxisLabels.length, 2)
  assert.equal(layout.xAxisLabels[0].text, 'Jan 1')
  assert.equal(layout.xAxisLabels[1].text, 'Feb 1')
  for (const l of layout.xAxisLabels) {
    assert.ok(l.fontSize >= 11)
  }
})

test('buildChartLayout: all points on the same date/value (flat, zero-range) does not throw and produces finite y coords', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-01-02', 60, 10), pt('2026-01-03', 60, 10)]
  const layout = buildChartLayout(points)
  for (const seg of layout.weightPolyline.split(' ')) {
    const [, y] = seg.split(',').map(Number)
    assert.ok(Number.isFinite(y))
  }
})

test('buildChartLayout: reps-only exercise (no weight) omits weight line/labels', () => {
  const points = [pt('2026-01-01', null, 10), pt('2026-02-01', null, 8)]
  const layout = buildChartLayout(points)
  assert.equal(layout.hasWeight, false)
  assert.equal(layout.weightPolyline, '')
  assert.equal(layout.weightLabels.length, 0)
  assert.equal(layout.hasReps, true)
})

test('buildChartLayout: sparse nulls interleaved with real values are skipped in the polyline but still contribute labels at true first/last', () => {
  const points = [
    pt('2026-01-01', 60, 10),
    pt('2026-01-08', null, null),
    pt('2026-01-15', 62, null),
    pt('2026-01-22', null, 9),
    pt('2026-02-01', 65, 8),
  ]
  const layout = buildChartLayout(points)
  // weight polyline should have exactly 3 vertices (indices 0, 2, 4)
  assert.equal(layout.weightPolyline.split(' ').length, 3)
  assert.equal(layout.weightLabels[0].value, 60)
  assert.equal(layout.weightLabels[1].value, 65)
  // reps polyline: indices 0, 3, 4
  assert.equal(layout.repsPolyline.split(' ').length, 3)
  assert.equal(layout.repsLabels[0].value, 10)
  assert.equal(layout.repsLabels[1].value, 8)
})

test('buildChartLayout: negative weight/reps values (defensive — should not occur upstream, but must not throw/NaN)', () => {
  const points = [pt('2026-01-01', -5, -3), pt('2026-02-01', 10, 4)]
  const layout = buildChartLayout(points)
  for (const seg of layout.weightPolyline.split(' ')) {
    const [x, y] = seg.split(',').map(Number)
    assert.ok(Number.isFinite(x) && Number.isFinite(y))
  }
})

test('buildChartLayout: exactly two points (minimum for a line, since 1-point is a special-cased summary view)', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-02-01', 65, 8)]
  const layout = buildChartLayout(points)
  assert.equal(layout.weightLabels.length, 2)
  assert.equal(layout.xAxisLabels.length, 2)
})

test('buildChartLayout: large point count (90 daily points) stays within finite, monotonically increasing x coordinates', () => {
  const points = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(2026, 0, 1 + i)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return pt(ds, 50 + (i % 10), 8 + (i % 5))
  })
  const layout = buildChartLayout(points)
  const xs = layout.weightPolyline.split(' ').map((s) => Number(s.split(',')[0]))
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] > xs[i - 1])
  }
})

// ─── Accessible summary (title/desc or aria-label source text) ────────────

test('buildChartSummary: describes weight+reps trend with first/last dates and values', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-01-15', 62, 9), pt('2026-02-01', 65, 8)]
  const summary = buildChartSummary(points)
  assert.match(summary, /Jan 1/)
  assert.match(summary, /Feb 1/)
  assert.match(summary, /60/)
  assert.match(summary, /65/)
  assert.match(summary, /kg/i)
  assert.match(summary, /reps/i)
})

test('buildChartSummary: weight-only omits reps language', () => {
  const points = [pt('2026-01-01', 60, null), pt('2026-02-01', 65, null)]
  const summary = buildChartSummary(points)
  assert.doesNotMatch(summary, /reps/i)
  assert.match(summary, /kg/i)
})

test('buildChartSummary: reps-only omits weight/kg language', () => {
  const points = [pt('2026-01-01', null, 10), pt('2026-02-01', null, 8)]
  const summary = buildChartSummary(points)
  assert.doesNotMatch(summary, /kg/i)
  assert.match(summary, /reps/i)
})

test('buildChartSummary: single point still returns a non-empty descriptive string', () => {
  const points = [pt('2026-01-01', 60, 10)]
  const summary = buildChartSummary(points)
  assert.ok(summary.length > 0)
  assert.match(summary, /60/)
})

test('buildChartSummary: empty points array returns a safe non-empty fallback string (defensive)', () => {
  const summary = buildChartSummary([])
  assert.equal(typeof summary, 'string')
  assert.ok(summary.length > 0)
})

test('buildChartLayout: empty points array does not throw (defensive robustness)', () => {
  assert.doesNotThrow(() => buildChartLayout([]))
})

test('buildChartLayout: repsClassName matches the exported REPS_STROKE_CLASS so the polyline/dots stay in sync with labels', () => {
  const points = [pt('2026-01-01', 60, 10), pt('2026-02-01', 65, 8)]
  const layout = buildChartLayout(points)
  assert.equal(layout.repsClassName, REPS_STROKE_CLASS)
})

// ─── WCAG contrast helper (test-local, mirrors sRGB relative luminance) ───

function contrastRatio(hex1, hex2) {
  const lum = (hex) => {
    const c = hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    const [R, G, B] = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    return 0.2126 * R + 0.7152 * G + 0.0722 * B
  }
  const L1 = lum(hex1)
  const L2 = lum(hex2)
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1]
  return (lighter + 0.05) / (darker + 0.05)
}
