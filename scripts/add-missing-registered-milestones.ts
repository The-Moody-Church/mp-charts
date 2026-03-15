#!/usr/bin/env tsx
/**
 * Script: Add missing Registered Member milestones (Milestone_ID=48) for
 * participants with Member_Status_ID=1 who don't already have one.
 * Uses Date_Joined as the Date_Accomplished value. Skips null Date_Joined.
 *
 * Usage: npx tsx scripts/add-missing-registered-milestones.ts [--dry-run]
 *
 *   --dry-run   Show what would be created without writing to MP (default)
 *   --execute   Actually create the milestone records
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
const PROGRAM_ID = 307;           // Membership Program
const MEMBER_STATUS_ID = 1;       // Registered Member

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  if (!execute) {
    console.log('=== DRY RUN (pass --execute to create records) ===\n');
  }

  const mp = new MPHelper();

  // Step 1: Get all Registered Member participants
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
    console.log('No registered members found. Nothing to do.');
    return;
  }

  // Step 2: Find which ones already have Milestone_ID=48
  const participantIds = members.map(p => p.Participant_ID);
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
  const allMissing = members.filter(p => !existingMilestoneIds.has(p.Participant_ID));

  // Separate out null Date_Joined — skip those
  const missing = allMissing.filter(p => p.Date_Joined != null);
  const skippedNullDate = allMissing.filter(p => p.Date_Joined == null);

  if (skippedNullDate.length > 0) {
    console.log(`Skipping ${skippedNullDate.length} member(s) with null Date_Joined:`);
    for (const p of skippedNullDate) {
      console.log(`  Participant ${p.Participant_ID} | Contact ${p.Contact_ID} | ${p.Display_Name}`);
    }
    console.log();
  }

  if (missing.length === 0) {
    console.log('All registered members (with dates) already have the Registered Member milestone. Nothing to do.');
    return;
  }

  console.log(`${missing.length} registered member(s) missing Milestone_ID=${MILESTONE_ID}:\n`);
  for (const p of missing) {
    const dj = p.Date_Joined!.split('T')[0];
    console.log(`  Participant ${p.Participant_ID} | Contact ${p.Contact_ID} | ${p.Display_Name} | Date_Joined: ${dj}`);
  }

  // Step 4: Build records to create
  const records = missing.map(p => ({
    Participant_ID: p.Participant_ID,
    Milestone_ID: MILESTONE_ID,
    Program_ID: PROGRAM_ID,
    Date_Accomplished: p.Date_Joined!,
  }));

  if (!execute) {
    console.log(`\n${records.length} records would be created.`);
    console.log('Re-run with --execute to create these records.');
    return;
  }

  // Step 5: Create the milestone records in batches
  console.log(`\nCreating ${records.length} milestone records...`);
  let totalCreated = 0;
  const logLines: string[] = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  logLines.push(`# Registered Member Milestone Backfill — ${new Date().toISOString()}`);
  logLines.push(`# Milestone_ID=${MILESTONE_ID}, Program_ID=${PROGRAM_ID}, Member_Status_ID=${MEMBER_STATUS_ID}`);
  logLines.push(`# Total members: ${members.length}, Already had milestone: ${existingMilestoneIds.size}, Skipped (null date): ${skippedNullDate.length}, Creating: ${missing.length}`);
  logLines.push('');
  logLines.push('Participant_Milestone_ID | Participant_ID | Contact_ID | Display_Name | Date_Accomplished');
  logLines.push('-'.repeat(100));

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batchRecords = records.slice(i, i + BATCH_SIZE);
    const batchMembers = missing.slice(i, i + BATCH_SIZE);
    const created = await mp.createTableRecords('Participant_Milestones', batchRecords) as unknown as { Participant_Milestone_ID: number }[];
    totalCreated += created.length;
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: created ${created.length} record(s) (${totalCreated}/${records.length} total)`);

    for (let j = 0; j < created.length; j++) {
      const p = batchMembers[j];
      const da = p.Date_Joined!.split('T')[0];
      logLines.push(`${String(created[j].Participant_Milestone_ID).padEnd(25)}| ${String(p.Participant_ID).padEnd(15)}| ${String(p.Contact_ID).padEnd(11)}| ${p.Display_Name.padEnd(30)}| ${da}`);
    }
  }

  logLines.push('');
  logLines.push(`# Total created: ${totalCreated}`);

  const logFile = path.resolve(__dirname, `registered-milestone-backfill-${timestamp}.log`);
  fs.writeFileSync(logFile, logLines.join('\n') + '\n');
  console.log(`\nSuccessfully created ${totalCreated} milestone(s).`);
  console.log(`Log saved to: ${logFile}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
