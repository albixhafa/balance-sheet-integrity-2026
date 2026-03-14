"use server";

import { prisma } from '@/lib/prisma';
import { getLoggedInUser } from './auth';
import { revalidatePath } from 'next/cache';

export async function processLedgerImport(parsedData: any[]) {
  console.log("🚀 STARTING IMPORT FOR", parsedData.length, "ROWS");
  
  const user = await getLoggedInUser();
  if (!user || (user.role !== 'ASSEMBLER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    throw new Error("Unauthorized");
  }

  // ---------------------------------------------------------
  // 🛡️ NEW: THE SECURITY GATE (CHECK FOR LOCKED PERIODS)
  // ---------------------------------------------------------
  // 1. Find all the unique GLs and Periods in this CSV upload
  const uniquePeriods = [...new Set(parsedData.map(r => r.period))];
  const uniqueGLs = [...new Set(parsedData.map(r => r.gl))];

  // 2. Ask the database if any of these specific GL + Period combos are already COMPLETED
  const lockedAccounts = await prisma.accountReconciliation.findMany({
    where: {
      glId: { in: uniqueGLs as string[] },
      periodId: { in: uniquePeriods as string[] },
      status: 'COMPLETED' // This means all 3 approvers have signed off
    }
  });

  // 3. If the DB finds any locked accounts that match the CSV, reject the whole upload instantly!
  if (lockedAccounts.length > 0) {
    const lockedDetails = lockedAccounts.map(a => `GL ${a.glId} (${a.periodId})`).join(', ');
    throw new Error(`IMPORT REJECTED: You are trying to import into closed periods. The following accounts are fully approved and locked: ${lockedDetails}`);
  }
  // ---------------------------------------------------------

  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (const row of parsedData) {
    try {
      console.log(`📝 Upserting Period: ${row.period}`);
      await prisma.financialPeriod.upsert({
        where: { id: row.period },
        update: {},
        create: { id: row.period }
      });

      console.log(`💾 Inserting Transaction for GL: ${row.gl}`);
      const newTxn = await prisma.transaction.create({
        data: {
          entityCode: row.entityCode,
          periodId: row.period,
          txnDate: row.transactionDate,
          reference: row.transactionReference || null,
          description: row.description || null,
          glId: row.gl,
          amount: parseFloat(row.amount),
          
          sub1Value: row.subAccounts[0] || null,
          sub2Value: row.subAccounts[1] || null,
          sub3Value: row.subAccounts[2] || null,
          sub4Value: row.subAccounts[3] || null,
          sub5Value: row.subAccounts[4] || null,
          sub6Value: row.subAccounts[5] || null,
          sub7Value: row.subAccounts[6] || null,
          sub8Value: row.subAccounts[7] || null,
          sub9Value: row.subAccounts[8] || null,
          sub10Value: row.subAccounts[9] || null,
        }
      });
      
      console.log("✅ SUCCESS! Created TXN ID:", newTxn.id);
      successCount++;
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log("⚠️ DUPLICATE SKIPPED:", row.transactionReference);
        duplicateCount++;
      } else {
        console.error("❌ DB ERROR:", error);
        errorCount++;
      }
    }
  }

  console.log(`🏁 FINISHED: ${successCount} Success, ${duplicateCount} Dups, ${errorCount} Errors`);
  
  // Force Next.js to dump its cache so the Account Details page instantly shows the new data
  revalidatePath('/', 'layout');

  // Note: Adjusted the return keys slightly to match what your frontend expects (success, duplicate, error)
  return { success: successCount, duplicate: duplicateCount, error: errorCount };
}