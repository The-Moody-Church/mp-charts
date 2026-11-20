import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * Sidebar entries are next/link, not plain anchors (upstream MPNext f1ad0c8):
 * a plain <a> reloaded the whole document on every click, re-running
 * AuthWrapper and both UserProvider server actions. next/link is mocked with
 * a marker so the test sees which component rendered each entry.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-authorization", () => ({
  useAuthorization: () => ({ canAccess: () => true, isSuperAdmin: true }),
}));
vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    journeyTools: [{ slug: "baptism", name: "Baptism", description: "" }],
    complianceTools: [{ slug: "ushers", name: "Ushers", description: "" }],
  }),
}));

import { Sidebar } from "./sidebar";

describe("Sidebar", () => {
  it("renders every navigation entry through next/link", () => {
    render(<Sidebar isOpen onClose={() => {}} />);

    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/",
      "/dashboard",
      "/contact-lookup",
      "/manage-members",
      "/summer-blast-volunteers",
      "/journey/baptism",
      "/compliance/ushers",
      "/admin",
    ]);
    for (const link of links) expect(link).toHaveAttribute("data-next-link");
  });

  it("closes the sidebar when an entry is clicked", () => {
    const onClose = vi.fn();
    render(<Sidebar isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole("link", { name: /contact lookup/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
