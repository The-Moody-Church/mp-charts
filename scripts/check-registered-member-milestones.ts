#!/usr/bin/env tsx
/**
 * Diagnostic script: Check if all Registered Members (Member_Status_ID=1) have
 * a Registered Member milestone (Milestone_ID=48) in Participant_Milestones,
 * and whether Date_Accomplished matches Date_Joined.
 *
 * Usage: npx tsx scripts/check-registered-member-milestones.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envFiles = ['.env.local', '.env.development', '.env'];
envFiles.forEach(file => {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
});

import { MPHelper } from '../src/lib/providers/ministry-platform';

const MILESTONE_ID = 48;          // Registered Member
const MEMBER_STATUS_ID = 1;       // Registered Member

async function main() {
  const mp = new MPHelper();

  // Step 1: Get all participants with Member_Status_ID = 1 (Registered Member)
  console.log(`Fetching participants with Member_Status_ID = ${MEMBER_STATUS_ID} (Registered Member)...`);
  const members = await mp.getTableRecords<{
    Participant_ID: number;
    Contact_ID: number;
    Display_Name: string;
    Date_Joined: string | null;
  }>({
    table: 'Participants',
    select: 'Participant_ID,Participants.[Contact_ID],Contact_ID_Table.[Display_Name],Date_Joined',
    filter: `Participants.[Member_Status_ID] = ${MEMBER_STATUS_ID}`,
  });

  console.log(`Found ${members.length} Registered Members\n`);

  if (members.length === 0) {
    console.log('No registered members found.');
    return;
  }

  // Step 2: Get all Participant_Milestones with Milestone_ID = 48 for these participants
  const participantIds = members.map(p => p.Participant_ID);
  console.log(`Checking for Registered Member milestones (Milestone_ID=${MILESTONE_ID})...`);

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
  const missing: typeof members = [];
  const matched: typeof members = [];
  const mismatched: { participant: typeof members[0]; dateAccomplished: string | null }[] = [];
  const nullDateJoined: typeof members = [];

  for (const p of members) {
    if (!milestoneMap.has(p.Participant_ID)) {
      if (p.Date_Joined == null) {
        nullDateJoined.push(p);
      } else {
        missing.push(p);
      }
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
  console.log(`Registered Members with milestone (date matches):     ${matched.length}`);
  console.log(`Registered Members with milestone (date MISMATCH):    ${mismatched.length}`);
  console.log(`Registered Members WITHOUT milestone (has date):      ${missing.length}`);
  console.log(`Registered Members WITHOUT milestone (null date):     ${nullDateJoined.length}`);
  console.log(`Total Registered Members:                             ${members.length}`);

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
    console.log(`\n--- Registered Members Missing Milestone (have Date_Joined) ---`);
    console.log('Participant_ID | Contact_ID | Display_Name                | Date_Joined');
    console.log('-'.repeat(80));
    for (const p of missing) {
      const dj = p.Date_Joined!.split('T')[0];
      console.log(
        `${String(p.Participant_ID).padEnd(15)}| ${String(p.Contact_ID).padEnd(11)}| ${p.Display_Name.padEnd(28)}| ${dj}`
      );
    }
  }

  if (nullDateJoined.length > 0) {
    console.log(`\n--- Registered Members Missing Milestone AND Date_Joined (skipped) ---`);
    console.log('Participant_ID | Contact_ID | Display_Name');
    console.log('-'.repeat(60));
    for (const p of nullDateJoined) {
      console.log(
        `${String(p.Participant_ID).padEnd(15)}| ${String(p.Contact_ID).padEnd(11)}| ${p.Display_Name}`
      );
    }
  }

  if (missing.length === 0 && mismatched.length === 0 && nullDateJoined.length === 0) {
    console.log('\nAll registered members have the Registered Member milestone with matching dates!');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
