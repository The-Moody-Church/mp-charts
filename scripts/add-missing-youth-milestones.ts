#!/usr/bin/env tsx
/**
 * Script: Add missing Youth Membership milestones (Milestone_ID=52) for
 * participants with Member_Status_ID=10 who don't already have one.
 * Uses Date_Joined as the Date_Accomplished value.
 *
 * Usage: npx tsx scripts/add-missing-youth-milestones.ts [--dry-run]
 *
 *   --dry-run   Show what would be created without writing to MP (default)
 *   --execute   Actually create the milestone records
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

const MILESTONE_ID = 52;          // Youth Membership
const PROGRAM_ID = 307;           // Membership Program
const MEMBER_STATUS_ID = 10;      // Youth Member

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  if (!execute) {
    console.log('=== DRY RUN (pass --execute to create records) ===\n');
  }

  const mp = new MPHelper();

  // Step 1: Get all Youth Member participants
  console.log(`Fetching participants with Member_Status_ID = ${MEMBER_STATUS_ID} (Youth Member)...`);
  const youthMembers = await mp.getTableRecords<{
    Participant_ID: number;
    Contact_ID: number;
    Display_Name: string;
    Date_Joined: string | null;
  }>({
    table: 'Participants',
    select: 'Participant_ID,Participants.[Contact_ID],Contact_ID_Table.[Display_Name],Date_Joined',
    filter: `Participants.[Member_Status_ID] = ${MEMBER_STATUS_ID}`,
  });

  console.log(`Found ${youthMembers.length} Youth Members\n`);

  if (youthMembers.length === 0) {
    console.log('No youth members found. Nothing to do.');
    return;
  }

  // Step 2: Find which ones already have Milestone_ID=52
  const participantIds = youthMembers.map(p => p.Participant_ID);
  const BATCH_SIZE = 100;
  const existingMilestoneIds = new Set<number>();

  for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
    const batch = participantIds.slice(i, i + BATCH_SIZE);
    const milestones = await mp.getTableRecords<{ Participant_ID: number }>({
      table: 'Participant_Milestones',
      select: 'Participant_ID',
      filter: `Milestone_ID = ${MILESTONE_ID} AND Participant_ID IN (${batch.join(',')})`,
    });
    for (const m of milestones) {
      existingMilestoneIds.add(m.Participant_ID);
    }
  }

  // Step 3: Filter to those missing the milestone
  const missing = youthMembers.filter(p => !existingMilestoneIds.has(p.Participant_ID));

  if (missing.length === 0) {
    console.log('All youth members already have the Youth Membership milestone. Nothing to do.');
    return;
  }

  console.log(`${missing.length} youth member(s) missing Milestone_ID=${MILESTONE_ID}:\n`);
  for (const p of missing) {
    const dj = p.Date_Joined?.split('T')[0] ?? '(null)';
    console.log(`  Participant ${p.Participant_ID} | Contact ${p.Contact_ID} | ${p.Display_Name} | Date_Joined: ${dj}`);
  }

  // Step 4: Build records to create
  const records = missing.map(p => ({
    Participant_ID: p.Participant_ID,
    Milestone_ID: MILESTONE_ID,
    Program_ID: PROGRAM_ID,
    Date_Accomplished: p.Date_Joined ?? new Date().toISOString(),
  }));

  if (!execute) {
    console.log('\nRecords that would be created:');
    for (const r of records) {
      console.log(`  Participant_ID=${r.Participant_ID}, Milestone_ID=${r.Milestone_ID}, Program_ID=${r.Program_ID}, Date_Accomplished=${r.Date_Accomplished}`);
    }
    console.log('\nRe-run with --execute to create these records.');
    return;
  }

  // Step 5: Create the milestone records
  console.log('\nCreating milestone records...');
  const created = await mp.createTableRecords('Participant_Milestones', records) as unknown as { Participant_Milestone_ID: number }[];

  console.log(`\nSuccessfully created ${created.length} milestone(s):`);
  for (let i = 0; i < created.length; i++) {
    console.log(`  Participant ${missing[i].Display_Name} → Participant_Milestone_ID = ${created[i].Participant_Milestone_ID}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
