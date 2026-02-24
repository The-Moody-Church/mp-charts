'use client';

import { useState, ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface SectionWrapperProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function SectionWrapper({ title, children, defaultExpanded = true }: SectionWrapperProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <h2 className="text-xl font-semibold tracking-tight group-hover:text-primary transition-colors">
          {title}
        </h2>
        <ChevronDownIcon
          className={`h-5 w-5 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      {expanded && (
        <div className="space-y-6">
          {children}
        </div>
      )}
    </div>
  );
}
