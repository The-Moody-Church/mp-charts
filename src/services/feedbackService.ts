/**
 * FeedbackService — creates GitHub issues from user feedback.
 *
 * Requires environment variables:
 *   GITHUB_FEEDBACK_TOKEN  — GitHub PAT with `repo` or `public_repo` scope
 *   GITHUB_FEEDBACK_REPO   — owner/repo (defaults to "The-Moody-Church/mp-charts")
 */

const DEFAULT_REPO = "The-Moody-Church/mp-charts";

interface CreateIssueParams {
  title: string;
  description: string | null;
  pageUrl: string;
  userName: string;
}

interface GitHubIssueResponse {
  number: number;
  html_url: string;
}

export class FeedbackService {
  private static instance: FeedbackService;
  private token: string;
  private repo: string;

  private constructor(token: string, repo: string) {
    this.token = token;
    this.repo = repo;
  }

  public static getInstance(): FeedbackService {
    if (!FeedbackService.instance) {
      const token = process.env.GITHUB_FEEDBACK_TOKEN;
      if (!token) {
        throw new Error("GITHUB_FEEDBACK_TOKEN environment variable is not set.");
      }
      const repo = process.env.GITHUB_FEEDBACK_REPO || DEFAULT_REPO;
      FeedbackService.instance = new FeedbackService(token, repo);
    }
    return FeedbackService.instance;
  }

  /**
   * Create a GitHub issue from user feedback.
   */
  public async createFeedbackIssue(
    params: CreateIssueParams
  ): Promise<GitHubIssueResponse> {
    const { title, description, pageUrl, userName } = params;

    // Build issue body with description, page URL, and submitter name
    const bodyParts: string[] = [];
    if (description) {
      bodyParts.push(description);
    }
    bodyParts.push("");
    bodyParts.push("---");
    bodyParts.push(`**Page:** ${pageUrl}`);
    bodyParts.push(`**Submitted by:** ${userName}`);

    const body = bodyParts.join("\n");

    const response = await fetch(
      `https://api.github.com/repos/${this.repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title,
          body,
          labels: ["user-feedback"],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `GitHub API error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as GitHubIssueResponse;
    return data;
  }
}
