'use client';

import { useState, useMemo } from 'react';
import { EngagementOverlap } from '@/lib/dto';

interface VennDiagramProps {
  data: EngagementOverlap;
}

// ─── Geometry helpers ──────────────────────────────────────────

/** Area of intersection between two circles with radii r1, r2 at distance d */
function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d + Math.min(r1, r2) <= Math.max(r1, r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 ** 2 * Math.acos((d ** 2 + r1 ** 2 - r2 ** 2) / (2 * d * r1));
  const b = r2 ** 2 * Math.acos((d ** 2 + r2 ** 2 - r1 ** 2) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a + b - c;
}

/** Binary search for the distance between centres that produces targetArea overlap */
function solveDistance(r1: number, r2: number, targetArea: number): number {
  if (targetArea <= 0) return r1 + r2 + 1;
  const maxArea = Math.PI * Math.min(r1, r2) ** 2;
  if (targetArea >= maxArea) return Math.abs(r1 - r2);
  let lo = Math.abs(r1 - r2), hi = r1 + r2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (circleOverlapArea(r1, r2, mid) > targetArea) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Layout computation ────────────────────────────────────────

interface Circle { x: number; y: number; r: number }
interface LabelPos { x: number; y: number; anchor: 'start' | 'end' | 'middle' }

// Font sizes in viewBox units
const FONT_LBL = 11;
const FONT_SUB = 10;
const FONT_NUM = 14;
const CHAR_W_RATIO = 0.62;

function textWidthVB(text: string, fontSize: number): number {
  return text.length * fontSize * CHAR_W_RATIO;
}

function computeLayout(data: EngagementOverlap) {
  const tA = data.totalActivity, tB = data.totalGroup, tC = data.totalServing;
  const maxT = Math.max(tA, tB, tC, 1);
  const MAX_R = 120;

  const rA = MAX_R * Math.sqrt(tA / maxT);
  const rB = MAX_R * Math.sqrt(tB / maxT);
  const rC = MAX_R * Math.sqrt(tC / maxT);

  const oAB = data.activityAndGroup + data.allThree;
  const oAC = data.activityAndServing + data.allThree;
  const oBC = data.groupAndServing + data.allThree;

  const k = Math.PI * MAX_R ** 2 / maxT;

  let dAB = (rA > 0 && rB > 0) ? solveDistance(rA, rB, k * oAB) : 0;
  let dAC = (rA > 0 && rC > 0) ? solveDistance(rA, rC, k * oAC) : 0;
  let dBC = (rB > 0 && rC > 0) ? solveDistance(rB, rC, k * oBC) : 0;

  const sides = [
    { key: 'AB' as const, v: dAB },
    { key: 'AC' as const, v: dAC },
    { key: 'BC' as const, v: dBC },
  ].sort((a, b) => b.v - a.v);
  if (sides[0].v > sides[1].v + sides[2].v) {
    const fix = sides[0].v - (sides[1].v + sides[2].v) + 0.1;
    if (sides[0].key === 'AB') dAB -= fix;
    else if (sides[0].key === 'AC') dAC -= fix;
    else dBC -= fix;
  }

  let cA: Circle, cB: Circle, cC: Circle;
  const activeCount = [rA, rB, rC].filter(r => r > 0).length;

  if (activeCount <= 1) {
    cA = { x: 0, y: 0, r: rA };
    cB = { x: 0, y: 0, r: rB };
    cC = { x: 0, y: 0, r: rC };
  } else if (rA === 0) {
    cA = { x: 0, y: 0, r: 0 };
    cB = { x: 0, y: 0, r: rB };
    cC = { x: dBC, y: 0, r: rC };
  } else if (rB === 0) {
    cA = { x: 0, y: 0, r: rA };
    cB = { x: 0, y: 0, r: 0 };
    cC = { x: dAC, y: 0, r: rC };
  } else if (rC === 0) {
    cA = { x: 0, y: 0, r: rA };
    cB = { x: dAB, y: 0, r: rB };
    cC = { x: 0, y: 0, r: 0 };
  } else {
    cA = { x: 0, y: 0, r: rA };
    cB = { x: dAB, y: 0, r: rB };
    const xC = (dAC ** 2 - dBC ** 2 + dAB ** 2) / (2 * dAB);
    const yC = Math.sqrt(Math.max(0, dAC ** 2 - xC ** 2));
    cC = { x: xC, y: yC, r: rC };
  }

  // Compute label positions (pushed outward from diagram centroid)
  const allCircles = [cA, cB, cC];
  const activeCircles = allCircles.filter(c => c.r > 0);
  const gx = activeCircles.reduce((s, c) => s + c.x, 0) / (activeCircles.length || 1);
  const gy = activeCircles.reduce((s, c) => s + c.y, 0) / (activeCircles.length || 1);

  function computeLabelPos(c: Circle): LabelPos {
    const dx = c.x - gx, dy = c.y - gy;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
    const off = c.r + 16;
    return {
      x: c.x + (dx / d) * off,
      y: c.y + (dy / d) * off,
      anchor: (dx > 5 ? 'start' : dx < -5 ? 'end' : 'middle'),
    };
  }

  const labelTexts = ['Any Activity', 'Communities & Groups', 'Serving/Leading'];
  const labelSubs = [
    `(${tA.toLocaleString()})`,
    `(${tB.toLocaleString()})`,
    `(${tC.toLocaleString()})`,
  ];
  const labels = allCircles.map((c, i) => ({
    pos: computeLabelPos(c),
    text: labelTexts[i],
    sub: labelSubs[i],
    visible: c.r > 0,
  }));

  // Build bounding box from circles + label text extents
  const PAD = 15;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const c of activeCircles) {
    minX = Math.min(minX, c.x - c.r);
    maxX = Math.max(maxX, c.x + c.r);
    minY = Math.min(minY, c.y - c.r);
    maxY = Math.max(maxY, c.y + c.r);
  }

  for (const lbl of labels) {
    if (!lbl.visible) continue;
    const longestText = lbl.text.length > lbl.sub.length ? lbl.text : lbl.sub;
    const longestFont = lbl.text.length > lbl.sub.length ? FONT_LBL : FONT_SUB;
    const tw = textWidthVB(longestText, longestFont);
    let lMinX: number, lMaxX: number;
    if (lbl.pos.anchor === 'start') {
      lMinX = lbl.pos.x;
      lMaxX = lbl.pos.x + tw;
    } else if (lbl.pos.anchor === 'end') {
      lMinX = lbl.pos.x - tw;
      lMaxX = lbl.pos.x;
    } else {
      lMinX = lbl.pos.x - tw / 2;
      lMaxX = lbl.pos.x + tw / 2;
    }
    minX = Math.min(minX, lMinX);
    maxX = Math.max(maxX, lMaxX);
    minY = Math.min(minY, lbl.pos.y - FONT_LBL);
    maxY = Math.max(maxY, lbl.pos.y + FONT_SUB + 4);
  }

  if (!isFinite(minX)) { minX = 0; maxX = 300; minY = 0; maxY = 300; }

  return {
    circles: [cA, cB, cC] as [Circle, Circle, Circle],
    labels,
    vb: `${minX - PAD} ${minY - PAD} ${maxX - minX + PAD * 2} ${maxY - minY + PAD * 2}`,
  };
}

/** True geometric centroid: grid-sample the intersection of inside circles minus outside circles */
function regionPoint(circles: Circle[], inside: number[], outside: number[]): { x: number; y: number } {
  function inCircle(px: number, py: number, c: Circle): boolean {
    const dx = px - c.x, dy = py - c.y;
    return dx * dx + dy * dy <= c.r * c.r;
  }
  function isInRegion(px: number, py: number): boolean {
    for (const i of inside) if (!inCircle(px, py, circles[i])) return false;
    for (const i of outside) if (circles[i].r > 0 && inCircle(px, py, circles[i])) return false;
    return true;
  }

  // Bounding box = intersection of inside circles' bounding boxes
  let bMinX = -Infinity, bMaxX = Infinity, bMinY = -Infinity, bMaxY = Infinity;
  for (const i of inside) {
    bMinX = Math.max(bMinX, circles[i].x - circles[i].r);
    bMaxX = Math.min(bMaxX, circles[i].x + circles[i].r);
    bMinY = Math.max(bMinY, circles[i].y - circles[i].r);
    bMaxY = Math.min(bMaxY, circles[i].y + circles[i].r);
  }

  // Sample a grid and average valid points to find the centroid
  const STEPS = 25;
  const dx = (bMaxX - bMinX) / STEPS;
  const dy = (bMaxY - bMinY) / STEPS;
  let sx = 0, sy = 0, count = 0;
  for (let xi = 0; xi <= STEPS; xi++) {
    for (let yi = 0; yi <= STEPS; yi++) {
      const px = bMinX + xi * dx;
      const py = bMinY + yi * dy;
      if (isInRegion(px, py)) { sx += px; sy += py; count++; }
    }
  }
  if (count > 0) return { x: sx / count, y: sy / count };

  // Fallback: centroid of inside circles
  let cx = 0, cy = 0;
  for (const i of inside) { cx += circles[i].x; cy += circles[i].y; }
  return { x: cx / inside.length, y: cy / inside.length };
}

// ─── Colors ────────────────────────────────────────────────────
// Primary colors: Red (Activity), Blue (Groups), Yellow (Serving)
// Overlaps blend naturally via SVG alpha compositing

const CLR = {
  A: { fill: 'rgba(220,38,38,0.35)', stroke: '#dc2626', text: '#dc2626' },   // red
  B: { fill: 'rgba(37,99,235,0.35)', stroke: '#2563eb', text: '#2563eb' },   // blue
  C: { fill: 'rgba(202,138,4,0.35)',  stroke: '#ca8a04', text: '#a16207' },   // yellow (darker text)
};

// Per-region colors: primaries + blended overlap colors
const REGION_CLR: Record<string, { text: string; bg: string }> = {
  'activity-only':    { text: '#dc2626', bg: 'rgba(220,38,38,0.12)' },    // red
  'group-only':       { text: '#2563eb', bg: 'rgba(37,99,235,0.12)' },    // blue
  'serving-only':     { text: '#a16207', bg: 'rgba(202,138,4,0.12)' },    // dark yellow
  'activity-group':   { text: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },   // purple
  'activity-serving': { text: '#ea580c', bg: 'rgba(234,88,12,0.12)' },    // orange
  'group-serving':    { text: '#16a34a', bg: 'rgba(22,163,74,0.12)' },    // green
  'all-three':        { text: '#334155', bg: 'rgba(51,65,85,0.12)' },     // slate
};

// ─── Component ─────────────────────────────────────────────────

export function VennDiagram({ data }: VennDiagramProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { circles, labels, vb } = useMemo(() => computeLayout(data), [data]);

  if (data.totalActivity === 0 && data.totalGroup === 0 && data.totalServing === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No engagement data available
      </div>
    );
  }

  const [cA, cB, cC] = circles;
  const all = [cA, cB, cC];
  const clrArr = [CLR.A, CLR.B, CLR.C];

  const regions = [
    { id: 'activity-only',   inside: [0],       outside: [1, 2], label: 'Activity Only',      count: data.activityOnly,       desc: 'Attended events but not in a group or serving' },
    { id: 'group-only',      inside: [1],       outside: [0, 2], label: 'Groups Only',        count: data.groupOnly,          desc: 'In a group but not attending events or serving' },
    { id: 'serving-only',    inside: [2],       outside: [0, 1], label: 'Serving Only',       count: data.servingOnly,        desc: 'Serving/leading but not attending events or in a group' },
    { id: 'activity-group',  inside: [0, 1],    outside: [2],    label: 'Activity + Groups',  count: data.activityAndGroup,   desc: 'Attending events and in a group' },
    { id: 'activity-serving',inside: [0, 2],    outside: [1],    label: 'Activity + Serving', count: data.activityAndServing, desc: 'Attending events and serving/leading' },
    { id: 'group-serving',   inside: [1, 2],    outside: [0],    label: 'Groups + Serving',   count: data.groupAndServing,    desc: 'In a group and serving/leading' },
    { id: 'all-three',       inside: [0, 1, 2], outside: [],     label: 'All Three',          count: data.allThree,           desc: 'Attending, in a group, and serving/leading' },
  ];

  const totalUnique = data.activityOnly + data.groupOnly + data.servingOnly
    + data.activityAndGroup + data.activityAndServing + data.groupAndServing + data.allThree;

  // Precompute region centroids for hover targets + labels
  const regionPts = useMemo(() => {
    const pts: Record<string, { x: number; y: number }> = {};
    for (const r of regions) {
      if (r.count === 0 || r.inside.some(i => all[i].r === 0)) continue;
      pts[r.id] = regionPoint(all, r.inside, r.outside);
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circles, data]);

  return (
    <div className="flex flex-col lg:flex-row lg:items-stretch gap-6">
      {/* Proportional Venn Diagram */}
      <div className="flex-1 min-w-0 flex items-center justify-center">
        <svg viewBox={vb} className="w-full h-full max-w-lg">
          {/* Circles */}
          {all.map((c, i) => c.r > 0 && (
            <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={clrArr[i].fill} stroke={clrArr[i].stroke} strokeWidth={2} />
          ))}

          {/* External circle labels */}
          {labels.map((lbl, i) => lbl.visible && (
            <g key={`label-${i}`}>
              <text
                x={lbl.pos.x}
                y={lbl.pos.y}
                textAnchor={lbl.pos.anchor}
                fontSize={FONT_LBL}
                fontWeight={600}
                fill={clrArr[i].text}
              >
                {lbl.text}
              </text>
              <text
                x={lbl.pos.x}
                y={lbl.pos.y + FONT_SUB + 3}
                textAnchor={lbl.pos.anchor}
                fontSize={FONT_SUB}
                fill="#6b7280"
              >
                {lbl.sub}
              </text>
            </g>
          ))}

          {/* Region count labels — pill badges with white background, rendered last to stay on top */}
          {regions.map(({ id, count }) => {
            const pt = regionPts[id];
            if (!pt) return null;
            const clr = REGION_CLR[id];
            const isHovered = hovered === id;
            const fs = isHovered ? FONT_NUM + 2 : FONT_NUM;
            const text = count.toLocaleString();
            const tw = textWidthVB(text, fs);
            const padX = 6, padY = 4;
            const rw = tw + padX * 2;
            const rh = fs + padY * 2;
            return (
              <g
                key={id}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <rect
                  x={pt.x - rw / 2}
                  y={pt.y - rh / 2}
                  width={rw}
                  height={rh}
                  rx={rh / 2}
                  fill="white"
                  stroke={clr?.text ?? '#94a3b8'}
                  strokeWidth={1.5}
                  opacity={0.95}
                />
                <text
                  x={pt.x}
                  y={pt.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={fs}
                  fontWeight={700}
                  fill={clr?.text ?? '#374151'}
                >
                  {text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Data table */}
      <div className="lg:w-[360px] shrink-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Category</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">People</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">%</th>
            </tr>
          </thead>
          <tbody>
            {/* Totals by dimension */}
            <tr className="border-b bg-red-50/50">
              <td className="py-2 px-3 font-medium" style={{ color: CLR.A.text }}>Any Activity</td>
              <td className="text-right py-2 px-3 tabular-nums">{data.totalActivity.toLocaleString()}</td>
              <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">{totalUnique > 0 ? `${Math.round(data.totalActivity / totalUnique * 100)}%` : '—'}</td>
            </tr>
            <tr className="border-b bg-blue-50/50">
              <td className="py-2 px-3 font-medium" style={{ color: CLR.B.text }}>Communities &amp; Groups</td>
              <td className="text-right py-2 px-3 tabular-nums">{data.totalGroup.toLocaleString()}</td>
              <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">{totalUnique > 0 ? `${Math.round(data.totalGroup / totalUnique * 100)}%` : '—'}</td>
            </tr>
            <tr className="border-b bg-yellow-50/50">
              <td className="py-2 px-3 font-medium" style={{ color: CLR.C.text }}>Serving/Leading</td>
              <td className="text-right py-2 px-3 tabular-nums">{data.totalServing.toLocaleString()}</td>
              <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">{totalUnique > 0 ? `${Math.round(data.totalServing / totalUnique * 100)}%` : '—'}</td>
            </tr>

            {/* Separator */}
            <tr><td colSpan={3} className="py-1"></td></tr>

            {/* Breakdown regions — color-coded to match diagram */}
            {regions.map(({ id, label, count }) => {
              if (count === 0) return null;
              const isHovered = hovered === id;
              const clr = REGION_CLR[id];
              return (
                <tr
                  key={id}
                  className="border-b cursor-pointer transition-colors"
                  style={{
                    borderLeft: `3px solid ${clr?.text ?? '#94a3b8'}`,
                    backgroundColor: isHovered ? clr?.bg : undefined,
                  }}
                  onMouseEnter={() => setHovered(id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <td className="py-1.5 px-3" style={{ color: clr?.text, fontWeight: isHovered ? 600 : undefined }}>{label}</td>
                  <td className="text-right py-1.5 px-3 tabular-nums">{count.toLocaleString()}</td>
                  <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground">
                    {totalUnique > 0 ? `${Math.round(count / totalUnique * 100)}%` : '—'}
                  </td>
                </tr>
              );
            })}

            {/* Total */}
            <tr className="border-t-2 font-semibold">
              <td className="py-2 px-3">Total Unique</td>
              <td className="text-right py-2 px-3 tabular-nums">{totalUnique.toLocaleString()}</td>
              <td className="text-right py-2 px-3 tabular-nums">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
