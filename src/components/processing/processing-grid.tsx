"use client";

import React from "react";

interface ProcessingGridProps<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  keyExtractor: (item: T) => number | string;
  renderCard: (item: T) => React.ReactNode;
  /** Add top margin (for use inside TabsContent). Defaults to false. */
  marginTop?: boolean;
}

export function ProcessingGrid<T>({
  items,
  loading,
  error,
  emptyMessage,
  keyExtractor,
  renderCard,
  marginTop = false,
}: ProcessingGridProps<T>) {
  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-500 bg-red-50 rounded-md">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 ${marginTop ? "mt-4" : ""}`}>
      {items.map((item) => (
        <React.Fragment key={keyExtractor(item)}>
          {renderCard(item)}
        </React.Fragment>
      ))}
    </div>
  );
}
