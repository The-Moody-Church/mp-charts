#!/usr/bin/env tsx
/**
 * Diagnostic script: Check if all Associate Members (Member_Status_ID=4) have
 * an Associate Membership milestone (Milestone_ID=51) in Participant_Milestones,
 * and whether Date_Accomplished matches Date_Joined.
 *
 * Usage: npx tsx scripts/check-associate-member-milestones.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars (same pattern as generate-types.ts)
const envFiles = ['.env.local', '.env.development', '.env'];
envFiles.forEach(file => {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
});

import { MPHelper } from '../src/lib/providers/ministry-platform';

const MILESTONE_ID = 51;          // Associate Membership
const MEMBER_STATUS_ID = 4;       // Associate Member

async function main() {
  const mp = new MPHelper();

  // Step 1: Get all participants with Member_Status_ID = 4 (Associate Member)
  console.log(`Fetching participants with Member_Status_ID = ${MEMBER_STATUS_ID} (Associate Member)...`);
  const associateMembers = await mp.getTableRecords<{
    Participant_ID: number;
    Contact_ID: number;
    Display_Name: string;
    Date_Joined: string | null;
  }>({
    table: 'Participants',
    select: 'Participant_ID,Participants.[Contact_ID],Contact_ID_Table.[Display_Name],Date_Joined',
    filter: `Participants.[Member_Status_ID] = ${MEMBER_STATUS_ID}`,
  });

  console.log(`Found ${associateMembers.length} Associate Members\n`);

  if (associateMembers.length === 0) {
    console.log('No associate members found.');
    return;
  }

  // Step 2: Get all Participant_Milestones with Milestone_ID = 51 for these participants
  const participantIds = associateMembers.map(p => p.Participant_ID);
  console.log(`Checking for Associate Membership milestones (Milestone_ID=${MILESTONE_ID})...`);

  // Batch to avoid URL length limits
  const BATCH_SIZE = 100;
  const milestoneMap = new Map<number, string | null>(); // Participant_ID → Date_Accomplished

  for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
    const batch = participantIds.slice(i, i + BATCH_SIZE);
    const milestones = await mp.getTableRecords<{
      Participant_ID: number;
      Date_Accomplished: string | null;
    }>({
      table: 'Participant_Milestones',
      select: 'Participant_ID,Date_Accomplished',
      filter: `Milestone_ID = ${MILESTONE_ID} AND Participant_ID IN (${batch.join(',')})`,
    });
    for (const m of milestones) {
      milestoneMap.set(m.Participant_ID, m.Date_Accomplished);
    }
  }

  // Step 3: Compare milestone dates with Date_Joined
  const missing: typeof associateMembers = [];
  const matched: typeof associateMembers = [];
  const mismatched: { participant: typeof associateMembers[0]; dateAccomplished: string | null }[] = [];

  for (const p of associateMembers) {
    if (!milestoneMap.has(p.Participant_ID)) {
      missing.push(p);
    } else {
      const dateAccomplished = milestoneMap.get(p.Participant_ID) ?? null;
      const dateJoinedNorm = p.Date_Joined?.split('T')[0] ?? null;
      const dateAccompNorm = dateAccomplished?.split('T')[0] ?? null;

      if (dateJoinedNorm === dateAccompNorm) {
        matched.push(p);
      } else {
        mismatched.push({ participant: p, dateAccomplished });
      }
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Associate Members with milestone (date matches):     ${matched.length}`);
  console.log(`Associate Members with milestone (date MISMATCH):    ${mismatched.length}`);
  console.log(`Associate Members WITHOUT milestone:                 ${missing.length}`);
  console.log(`Total Associate Members:                             ${associateMembers.length}`);

  if (mismatched.length > 0) {
    console.log(`\n--- Date Mismatches (Milestone exists but Date_Accomplished ≠ Date_Joined) ---`);
    console.log('Participant_ID | Contact_ID | Display_Name                | Date_Joined | Date_Accomplished');
    console.log('-'.repeat(105));
    for (const { participant: p, dateAccomplished } of mismatched) {
      const dj = p.Date_Joined?.split('T')[0] ?? '(null)';
      const da = dateAccomplished?.split('T')[0] ?? '(null)';
      console.log(
        `${String(p.Participant_ID).padEnd(15)}| ${String(p.Contact_ID).padEnd(11)}| ${p.Display_Name.padEnd(28)}| ${dj.padEnd(12)}| ${da}`
      );
    }
  }

  if (missing.length > 0) {
    console.log(`\n--- Associate Members Missing Associate Membership Milestone ---`);
    console.log('Participant_ID | Contact_ID | Display_Name                | Date_Joined');
    console.log('-'.repeat(80));
    for (const p of missing) {
      const dj = p.Date_Joined?.split('T')[0] ?? '(null)';
      console.log(
        `${String(p.Participant_ID).padEnd(15)}| ${String(p.Contact_ID).padEnd(11)}| ${p.Display_Name.padEnd(28)}| ${dj}`
      );
    }
  }

  if (missing.length === 0 && mismatched.length === 0) {
    console.log('\nAll associate members have the Associate Membership milestone with matching dates!');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
