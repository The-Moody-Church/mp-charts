'use client';

import { useState } from 'react';
import { EngagementOverlap } from '@/lib/dto';

interface VennDiagramProps {
  data: EngagementOverlap;
}

interface Region {
  label: string;
  count: number;
  description: string;
}

export function VennDiagram({ data }: VennDiagramProps) {
  const [hoveredRegion, setHoveredRegion] = useState<Region | null>(null);

  const hasData = data.totalActivity > 0 || data.totalGroup > 0 || data.totalServing > 0;

  if (!hasData) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No engagement data available
      </div>
    );
  }

  // SVG coordinates for the 3-circle Venn
  const cx1 = 200, cy1 = 180; // Activity (left)
  const cx2 = 320, cy2 = 180; // Groups (right)
  const cx3 = 260, cy3 = 290; // Serving (bottom)
  const r = 120;

  const regions: { id: string; region: Region }[] = [
    { id: 'activity-only', region: { label: 'Activity Only', count: data.activityOnly, description: 'Attended events but not in a group or serving' } },
    { id: 'group-only', region: { label: 'Groups Only', count: data.groupOnly, description: 'In a group but not attending events or serving' } },
    { id: 'serving-only', region: { label: 'Serving Only', count: data.servingOnly, description: 'Serving/leading but not attending events or in a group' } },
    { id: 'activity-group', region: { label: 'Activity + Groups', count: data.activityAndGroup, description: 'Attending events and in a group' } },
    { id: 'activity-serving', region: { label: 'Activity + Serving', count: data.activityAndServing, description: 'Attending events and serving/leading' } },
    { id: 'group-serving', region: { label: 'Groups + Serving', count: data.groupAndServing, description: 'In a group and serving/leading' } },
    { id: 'all-three', region: { label: 'All Three', count: data.allThree, description: 'Attending, in a group, and serving/leading' } },
  ];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 520 420" className="w-full max-w-lg">
        {/* Circle fills with transparency */}
        <circle cx={cx1} cy={cy1} r={r} fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" strokeWidth={2} />
        <circle cx={cx2} cy={cy2} r={r} fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" strokeWidth={2} />
        <circle cx={cx3} cy={cy3} r={r} fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth={2} />

        {/* Labels for circles */}
        <text x={cx1 - 70} y={cy1 - 80} className="text-xs font-semibold" fill="#3b82f6">Any Activity</text>
        <text x={cx1 - 70} y={cy1 - 65} className="text-xs" fill="#6b7280">({data.totalActivity.toLocaleString()})</text>

        <text x={cx2 + 30} y={cy2 - 80} className="text-xs font-semibold" fill="#10b981">Small Group</text>
        <text x={cx2 + 30} y={cy2 - 65} className="text-xs" fill="#6b7280">({data.totalGroup.toLocaleString()})</text>

        <text x={cx3 - 20} y={cy3 + r + 25} className="text-xs font-semibold" fill="#d97706">Serving/Leading</text>
        <text x={cx3 - 20} y={cy3 + r + 40} className="text-xs" fill="#6b7280">({data.totalServing.toLocaleString()})</text>

        {/* Region counts - positioned approximately in each region */}
        {/* Activity only (far left) */}
        <text
          x={cx1 - 50} y={cy1}
          className="text-sm font-bold cursor-pointer"
          fill="#3b82f6"
          onMouseEnter={() => setHoveredRegion(regions[0].region)}
          onMouseLeave={() => setHoveredRegion(null)}
        >{data.activityOnly.toLocaleString()}</text>

        {/* Group only (far right) */}
        <text
          x={cx2 + 40} y={cy2}
          className="text-sm font-bold cursor-pointer"
          fill="#10b981"
          onMouseEnter={() => setHoveredRegion(regions[1].region)}
          onMouseLeave={() => setHoveredRegion(null)}
        >{data.groupOnly.toLocaleString()}</text>

        {/* Serving only (far bottom) */}
        <text
          x={cx3} y={cy3 + 70}
          textAnchor="middle"
          className="text-sm font-bold cursor-pointer"
          fill="#d97706"
          onMouseEnter={() => setHoveredRegion(regions[2].region)}
          onMouseLeave={() => setHoveredRegion(null)}
        >{data.servingOnly.toLocaleString()}</text>

        {/* Activity + Group (top center overlap) */}
        <text
          x={(cx1 + cx2) / 2} y={cy1 - 10}
          textAnchor="middle"
          className="text-sm font-bold cursor-pointer"
          fill="#374151"
          onMouseEnter={() => setHoveredRegion(regions[3].region)}
          onMouseLeave={() => setHoveredRegion(null)}
        >{data.activityAndGroup.toLocaleString()}</text>

        {/* Activity + Serving (left-bottom overlap) */}
        <text
          x={(cx1 + cx3) / 2 - 20} y={(cy1 + cy3) / 2 + 15}
          textAnchor="middle"
          className="text-sm font-bold cursor-pointer"
          fill="#374151"
          onMouseEnter={() => setHoveredRegion(regions[4].region)}
          onMouseLeave={() => setHoveredRegion(null)}
        >{data.activityAndServing.toLocaleString()}</text>

        {/* Group + Serving (right-bottom overlap) */}
        <text
          x={(cx2 + cx3) / 2 + 20} y={(cy2 + cy3) / 2 + 15}
          textAnchor="middle"
          className="text-sm font-bold cursor-pointer"
          fill="#374151"
          onMouseEnter={() => setHoveredRegion(regions[5].region)}
          onMouseLeave={() => setHoveredRegion(null)}
        >{data.groupAndServing.toLocaleString()}</text>

        {/* All three (center) */}
        <text
          x={(cx1 + cx2 + cx3) / 3} y={(cy1 + cy2 + cy3) / 3}
          textAnchor="middle"
          className="text-sm font-bold cursor-pointer"
          fill="#111827"
          onMouseEnter={() => setHoveredRegion(regions[6].region)}
          onMouseLeave={() => setHoveredRegion(null)}
        >{data.allThree.toLocaleString()}</text>
      </svg>

      {/* Tooltip */}
      {hoveredRegion && (
        <div className="mt-2 px-3 py-2 bg-white border rounded-lg shadow-sm text-center">
          <p className="text-sm font-semibold">{hoveredRegion.label}: {hoveredRegion.count.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{hoveredRegion.description}</p>
        </div>
      )}
    </div>
  );
}
