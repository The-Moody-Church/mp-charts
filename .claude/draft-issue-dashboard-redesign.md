# Redesign Dashboard Layout: Discipleship Pathway Sections

## Summary

Redesign the executive dashboard from a flat chart grid into a structured layout organized around four discipleship pathway sections — **Know God**, **Feed Your Soul**, **Grow in Love**, **Change Your World** — plus an **Other** section for charts that don't fit. Add a **Venn diagram** at the top showing engagement overlap across three dimensions.

This is a layout and data reorganization. Some existing charts move into sections as-is, some need modifications, and several new charts and data queries are required.

## Engagement Venn Diagram (Top of Dashboard)

Display a 3-circle Venn diagram at the top of the dashboard showing **person counts in all 7 regions** (3 exclusive, 3 pairwise overlaps, 1 triple intersection) for the selected date range.

The three circles:
1. **Any Activity** — unique `Contact_ID`s from `Event_Participants` (any event type, Participation_Status indicating attendance) within the selected period
2. **Small Group / Community** — unique `Contact_ID`s from `Group_Participants` where the group's `Group_Type` is a small group or community type (same filter logic already in `DashboardService.getSmallGroupTrends`: name matching "small", "life", "community", or `Group_Type_ID = 11` for communities) AND the participant was active during the period (`Start_Date <= periodEnd` and (`End_Date IS NULL` or `End_Date >= periodStart`))
3. **Serving / Leading** — unique `Contact_ID`s from `Group_Participants` where `Group_Role_ID` maps to a `Group_Role` with `Group_Role_Type_ID` indicating a serving or leading role type (from `Group_Role_Types` table — Claude should query available `Group_Role_Types` to identify the correct IDs, or ask the user)

**Data flow**: All three queries return sets of `Contact_ID`s. Compute intersections in JavaScript to produce the 7 region counts. The Venn should be interactive (hovering a region shows the count) and visually proportional if feasible, but correctness of counts is more important than proportional sizing.

**Implementation note**: This requires new `DashboardService` methods to return contact ID sets (or at minimum, counts per region). Consider a single method `getEngagementOverlap(startDate, endDate)` that runs the three queries in parallel and computes the overlap.

## Section 1: Know God

Charts about Sunday morning worship, baptisms, membership milestones, and overall event participation.

### Charts

| Chart | Status | Description | Data Source |
|-------|--------|-------------|-------------|
| **Worship Service Attendance** | EXISTING — move here | Monthly/weekly line chart (in-person, online, total) | `Event_Metrics` for `Event_Type_ID = 7` (already implemented as `AttendanceChart`) |
| **Baptisms** | EXISTING — move here | Metric card showing count | `Participant_Milestones` where `Milestone_ID = 3` (already implemented as `MetricCard`) |
| **Membership** | NEW | Metric card or trend showing new members in period | `Participant_Milestones` — Claude should query available Milestone IDs to find the membership milestone, or ask the user for the correct `Milestone_ID` |
| **Unique Event Participants** | NEW | Metric card showing count of unique `Contact_ID`s who attended any event | `Event_Participants` — count distinct `Contact_ID` where `Participation_Status_ID` indicates attendance, event date within period |

### Notes
- The existing **Avg In-Person Attendance** and **Avg Online Attendance** metric cards move here alongside the attendance chart
- The baptisms metric card moves here from the current top row
- The **Year-Over-Year Comparison** chart may make sense here if scoped to worship attendance metrics, or it could go in **Other**

## Section 2: Feed Your Soul

Charts about community involvement and small group participation. Focus on both **roster participation** (people on group rosters) and **actual attendance** (people who checked in at events).

### Charts

| Chart | Status | Description | Data Source |
|-------|--------|-------------|-------------|
| **Community Sunday Gathering Attendance** | EXISTING — move here | Stacked area chart by community | `Event_Participants` for community groups (`Group_Type_ID = 11`) — already implemented as `CommunityAttendanceChart` |
| **Small Group Trends** | EXISTING — move here | Dual-axis line chart (active groups + participants) | `Group_Participants` for small group types — already implemented as `SmallGroupTrends` |
| **Group Participation by Type** | EXISTING — move here | Pie chart by group type | `Group_Participants` aggregated by `Group_Type` — already implemented as `GroupParticipationChart`. Consider filtering to only community/small group types for this section |
| **Roster vs Attendance** | NEW | Comparison showing group roster count vs actual event check-in count | **Roster**: `Group_Participants` count (unique contacts on active group rosters). **Attendance**: `Event_Participants` count (unique contacts who checked in at group events). Grouped by group type or individual group. This highlights the gap between people on paper vs people showing up |

### Notes
- "Roster" = `Group_Participants` records (people assigned to a group)
- "Attendance" = `Event_Participants` records with present status for events linked to those groups
- The Roster vs Attendance chart could be a grouped bar chart (roster bar vs attendance bar per group/type)
- The existing **Active Communities and Small Groups** metric card moves here

## Section 3: Grow in Love

Charts about volunteering, serving, and leading. Data is primarily from **group roles**, not event attendance (most serving roles don't take attendance).

### Charts

| Chart | Status | Description | Data Source |
|-------|--------|-------------|-------------|
| **Total Serving/Leading** | NEW | Metric card or trend line showing total unique people in serving or leading roles over time | `Group_Participants` joined to `Group_Roles` → `Group_Role_Types`. Filter to serving/leading role types. Count distinct `Contact_ID`s. Claude should query `Group_Role_Types` to identify the correct type IDs, or ask the user |
| **Serving by Role Type** | NEW | Breakdown of volunteers by `Group_Role_Type` (e.g., Serving, Leading, etc.) | `Group_Participants` → `Group_Roles` → `Group_Role_Types`. Pie or bar chart with count of unique contacts per role type |
| **Where People Serve** | NEW | Chart showing distribution of volunteers across ministries or groups | `Group_Participants` (serving/leading roles) → `Groups` → `Group_Type` or `Ministry_ID` (from `Group_Roles.Ministry_ID`). Bar chart showing count of unique contacts per ministry or group |
| **Serving Trends** | NEW | Monthly trend of active servers/leaders over time | `Group_Participants` with serving/leading roles, aggregated by month (using `Start_Date` / `End_Date` to determine active status per month). Line chart similar to Small Group Trends |

### Notes
- Key distinction from Section 2: this section focuses on **role type** (serving/leading) rather than **group type** (small group/community)
- The `Group_Role_Types` table categorizes roles. Claude should inspect available values to determine which types represent serving vs leading vs participant
- `Group_Roles` has a `Ministry_ID` FK to `Ministries` — useful for the "Where People Serve" chart
- Event_Participants is NOT useful here because most serving contexts don't take attendance
- Consider a stacked area or line chart for trends showing serving + leading over time

## Section 4: Change Your World

Primarily future-facing (survey data). For now, include financial charts showing generosity toward specific programs.

### Charts

| Chart | Status | Description | Data Source |
|-------|--------|-------------|-------------|
| **Program Giving** | NEW | Sum of donations to specific programs (e.g., Redemption Project, Operation Christmas Child) | `Donation_Distributions` joined to `Donations` (for date) and `Programs` (for program name). Sum `Amount` grouped by `Program_ID`, filtered by donation date within period. Claude should ask the user which `Program_ID`s to include, or display all programs above a threshold |
| **Giving Trends** | NEW (optional) | Monthly trend of giving to tracked programs | Same data as above, aggregated by month. Line or bar chart |

### Notes
- This section will expand significantly when survey data becomes available
- For now, keep it simple with 1-2 financial charts
- `Donation_Distributions.Program_ID` → `Programs.Program_ID` links donations to specific programs
- `Donations.Donation_Date` provides the date for filtering
- The donor chain: `Donations` → `Donors` → `Contacts` (if ever needed to tie back to people)
- Claude should ask the user which specific programs to highlight, or implement a configurable list

## Section 5: Other

Charts that don't fit neatly into the four discipleship pathway sections.

### Charts

| Chart | Status | Description |
|-------|--------|-------------|
| **Year-Over-Year Comparison** | EXISTING — move here (or Know God) | Horizontal bar chart comparing current vs previous period. Could stay in Know God if scoped to worship metrics only |
| **Period Comparison metrics** | EXISTING — evaluate | May be redundant once charts are section-specific with their own metric cards |

### Notes
- This section is a catch-all. As new charts are added, they should be categorized into one of the four main sections if possible
- If no charts end up here, the section can be hidden

## Layout & UX

### Overall Structure

```
┌──────────────────────────────────────────────────┐
│  Dashboard Header + Date Range Filter            │
├──────────────────────────────────────────────────┤
│  Engagement Venn Diagram (3-circle)              │
│  [Any Activity] ∩ [Small Group] ∩ [Serving]     │
├──────────────────────────────────────────────────┤
│  § Know God                                       │
│  ┌─────────┬─────────┬─────────┬─────────┐      │
│  │ Avg IP  │ Avg Onl │ Baptisms│ Members │      │ ← Metric cards
│  └─────────┴─────────┴─────────┴─────────┘      │
│  ┌────────────────────────────────────────┐      │
│  │ Worship Service Attendance Chart       │      │
│  └────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────┐      │
│  │ Unique Event Participants (card/chart) │      │
│  └────────────────────────────────────────┘      │
├──────────────────────────────────────────────────┤
│  § Feed Your Soul                                 │
│  ┌─────────────────────┬──────────────────┐      │
│  │ Community Attendance │ Small Grp Trends │      │
│  └─────────────────────┴──────────────────┘      │
│  ┌─────────────────────┬──────────────────┐      │
│  │ Group Participation  │ Roster vs Attend │      │
│  └─────────────────────┴──────────────────┘      │
├──────────────────────────────────────────────────┤
│  § Grow in Love                                   │
│  ┌─────────┬──────────────────────────────┐      │
│  │Total Srv│ Serving by Role Type         │      │
│  └─────────┴──────────────────────────────┘      │
│  ┌─────────────────────┬──────────────────┐      │
│  │ Where People Serve  │ Serving Trends   │      │
│  └─────────────────────┴──────────────────┘      │
├──────────────────────────────────────────────────┤
│  § Change Your World                              │
│  ┌────────────────────────────────────────┐      │
│  │ Program Giving                         │      │
│  └────────────────────────────────────────┘      │
├──────────────────────────────────────────────────┤
│  § Other (if any)                                 │
└──────────────────────────────────────────────────┘
```

### Section Behavior
- Each section should have a clear heading (section name)
- Sections should be collapsible (click heading to expand/collapse) — default all expanded
- Existing `ExpandableChart` dialog pattern continues for individual charts
- The date range filter and compare toggle at the top apply globally to all sections

## Implementation Guidance for Claude

### What to ask the user at development time
1. **Milestone IDs**: Which `Milestone_ID` represents membership? (Baptism is already known: `Milestone_ID = 3`)
2. **Group Role Types**: Which `Group_Role_Type_ID` values represent "serving" vs "leading"? Query the `Group_Role_Types` table and present the options
3. **Programs for Change Your World**: Which `Program_ID`s should be shown in the giving charts? Query the `Programs` table and present the options
4. **Attendance status**: Which `Participation_Status_ID` values indicate someone was "present"? (Current code uses status 3 and 4 for community attendance — confirm this applies globally)

### Phased implementation approach
1. **Phase 1 — Layout restructure**: Reorganize existing charts into sections without adding new data. Move AttendanceChart, MetricCards, CommunityAttendanceChart, SmallGroupTrends, and GroupParticipationChart into their respective sections. Add section headings and collapsible behavior.
2. **Phase 2 — Know God additions**: Add membership milestone metric card and unique event participants count. These are straightforward queries against existing patterns.
3. **Phase 3 — Feed Your Soul additions**: Add Roster vs Attendance chart. Requires new `DashboardService` method.
4. **Phase 4 — Grow in Love (new section)**: All new charts. Requires new service methods querying `Group_Participants` → `Group_Roles` → `Group_Role_Types` and `Ministries`.
5. **Phase 5 — Change Your World**: Financial charts from `Donation_Distributions`. Requires new service methods.
6. **Phase 6 — Venn Diagram**: Engagement overlap visualization. Requires new service method returning contact ID sets and a Venn diagram component (may need a new charting library or custom SVG).

### Key data relationships (from MP schema)
```
Group_Participants
  → Group_ID → Groups (Group_Type_ID → Group_Types)
  → Participant_ID → Participants (Contact_ID → Contacts)
  → Group_Role_ID → Group_Roles
      → Group_Role_Type_ID → Group_Role_Types
      → Ministry_ID → Ministries

Event_Participants
  → Event_ID → Events (Event_Type_ID → Event_Types)
  → Participant_ID → Participants (Contact_ID → Contacts)
  → Group_Role_ID → Group_Roles (optional)

Donation_Distributions
  → Donation_ID → Donations (Donation_Date, Donor_ID → Donors → Contact_ID)
  → Program_ID → Programs

Participant_Milestones
  → Participant_ID → Participants
  → Milestone_ID → Milestones
```

### Files that will be modified
- `src/components/dashboard/dashboard-metrics.tsx` — major refactor for section layout
- `src/components/dashboard/dashboard-shell.tsx` — may need section collapse state
- `src/services/dashboardService.ts` — new data methods
- `src/lib/dto/dashboard.ts` — new interfaces for new data types
- `src/components/dashboard/actions.ts` — new server actions for new data

### New files expected
- `src/components/dashboard/venn-diagram.tsx` — engagement Venn
- `src/components/dashboard/roster-vs-attendance.tsx` — Feed Your Soul chart
- `src/components/dashboard/serving-charts.tsx` (or split into multiple) — Grow in Love charts
- `src/components/dashboard/giving-charts.tsx` — Change Your World charts
- `src/components/dashboard/section-wrapper.tsx` — collapsible section component
