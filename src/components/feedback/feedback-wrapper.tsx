"use client";

import { useUser } from "@/contexts";
import { FeedbackButton } from "./feedback-button";

export function FeedbackWrapper() {
  const { feedbackEnabled, isLoading } = useUser();

  if (isLoading || !feedbackEnabled) {
    return null;
  }

  return <FeedbackButton />;
}
