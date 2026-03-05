import { MPHelper } from "@/lib/providers/ministry-platform";
import type { FeedbackEntries } from "@/lib/providers/ministry-platform/models/FeedbackEntries";

export class FeedbackService {
  private static instance: FeedbackService;
  private mp: MPHelper | null = null;

  private constructor() {}

  public static async getInstance(): Promise<FeedbackService> {
    if (!FeedbackService.instance) {
      FeedbackService.instance = new FeedbackService();
      FeedbackService.instance.mp = new MPHelper();
    }
    return FeedbackService.instance;
  }

  /**
   * Create a feedback entry in Ministry Platform.
   */
  public async createFeedbackEntry(
    record: Omit<FeedbackEntries, "Feedback_Entry_ID">,
    userId: number
  ): Promise<FeedbackEntries> {
    const results = await this.mp!.createTableRecords(
      "Feedback_Entries",
      [record],
      { $userId: userId }
    );
    return (results as unknown as FeedbackEntries[])[0];
  }
}
