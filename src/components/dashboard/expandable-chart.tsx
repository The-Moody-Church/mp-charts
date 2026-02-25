'use client';

import { ReactNode, useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ExpandableChartProps {
  title: string;
  description?: string;
  children: ReactNode;
  expandedChildren?: ReactNode;
}

export function ExpandableChart({
  title,
  description,
  children,
  expandedChildren
}: ExpandableChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [chartKey, setChartKey] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // On mobile, dismiss Recharts click-triggered tooltips when tapping outside
  // the chart area. Recharts doesn't expose a way to programmatically close
  // tooltips, so we force a re-mount by incrementing the chart's React key.
  useEffect(() => {
    if (!isMobile) return;

    function handlePointerDown(e: PointerEvent) {
      if (chartRef.current && !chartRef.current.contains(e.target as Node)) {
        setChartKey(k => k + 1);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMobile]);

  return (
    <>
      <div className="relative group">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={() => setIsExpanded(true)}
          aria-label="Expand chart"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        {/* On mobile, disable click-to-expand on the chart area — tap the expand
            button instead. This prevents the wrapper click from intercepting
            Recharts' click-triggered tooltips on touch devices. */}
        <div ref={chartRef} className={isMobile ? '' : 'cursor-pointer'} onClick={isMobile ? undefined : () => setIsExpanded(true)}>
          <div key={chartKey}>
            {children}
          </div>
        </div>
      </div>

      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </DialogHeader>
          <div className="mt-4">
            {expandedChildren || children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
