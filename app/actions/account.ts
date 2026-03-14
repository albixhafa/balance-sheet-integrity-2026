"use server";

import { prisma } from '@/lib/prisma';
import { getLoggedInUser } from './auth';
import { revalidatePath } from 'next/cache';

// --- STRICT AUTHENTICATION (NO MORE FALLBACKS) ---
async function ensureUser() {
  const sessionUser = await getLoggedInUser();

  // Check if we have a user and an email
  if (!sessionUser || !sessionUser.email) {
    throw new Error("AUTH FAILED: No active session found.");
  }

  // Look them up strictly by the guaranteed email field
  const fullUser = await prisma.user.findUnique({
    where: { email: sessionUser.email },
    include: { entities: true }
  });

  if (!fullUser) {
    throw new Error("AUTH FAILED: Could not match your login to a real database user.");
  }

  return fullUser;
}

export async function getAccountDetails(glId: string) {
  const user = await ensureUser();

  const glAccount = await prisma.gLAccount.findUnique({
    where: { id: glId },
    include: { entity: true }
  });

  if (!glAccount) throw new Error("GL Account not found");

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    const hasAccess = user.entities?.some((e: any) => e.code === glAccount.entityCode);
    if (!hasAccess) {
      throw new Error("UNAUTHORIZED: You do not have permission to view this company's ledger.");
    }
  }

  // Fetch ALL transactions across all periods for this GL
  const rawTransactions = await prisma.transaction.findMany({
    where: { glId },
    orderBy: { txnDate: 'asc' }
  });

  const transactions = rawTransactions.map(txn => ({
    ...txn,
    amount: txn.amount.toNumber(), 
  }));

  // Fetch ALL reconciliations across all periods for this GL
  const recons = await prisma.accountReconciliation.findMany({
    where: { glId },
    orderBy: { periodId: 'desc' }
  });

  // Map users to the signatures
  const userIds = [...new Set(recons.flatMap(r => [r.assemblerId, r.reviewerId, r.approverId]).filter(Boolean))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds as string[] } } });
  const userMap = new Map(users.map(u => [u.id, u]));

  const enrichedRecons = recons.map(r => ({
    ...r,
    assembler: r.assemblerId ? userMap.get(r.assemblerId) : null,
    reviewer: r.reviewerId ? userMap.get(r.reviewerId) : null,
    approver: r.approverId ? userMap.get(r.approverId) : null,
  }));

  // --- AUTOMATIC PERIOD ROLLOVER CALCULATION ---
  const allPeriodIds = [...new Set([...transactions.map(t => t.periodId), ...enrichedRecons.map(r => r.periodId)])].sort().reverse();
  if (allPeriodIds.length === 0) allPeriodIds.push('202603'); // Default start if brand new account

  let activePeriodId = allPeriodIds[0];
  const latestRecon = enrichedRecons.find(r => r.periodId === activePeriodId);

  // If the latest period is fully approved, automatically shift to the next month
  if (latestRecon && latestRecon.approverId) {
     let year = parseInt(activePeriodId.substring(0,4));
     let month = parseInt(activePeriodId.substring(4,6));
     month++;
     if (month > 12) { month = 1; year++; }
     activePeriodId = `${year}${month.toString().padStart(2, '0')}`;
  }

  // Split data into Current vs Historical
  const currentTransactions = transactions.filter(t => t.periodId === activePeriodId);
  const currentRecon = enrichedRecons.find(r => r.periodId === activePeriodId) || null;

  const historicalPeriods = enrichedRecons
    .filter(r => r.periodId !== activePeriodId && r.approverId) // Only show fully closed periods in history
    .map(recon => ({
       periodId: recon.periodId,
       recon: recon,
       transactions: transactions.filter(t => t.periodId === recon.periodId)
    }));

  return { 
    glAccount, 
    currentPeriodId: activePeriodId, 
    currentTransactions, 
    currentRecon, 
    historicalPeriods, 
    currentUser: user 
  };
}

export async function signOff(glId: string, periodId: string, role: 'assembler' | 'reviewer' | 'approver') {
  const user = await ensureUser(); 
  const now = new Date();

  // --- 1. ENFORCE NET ZERO FOR ASSEMBLER ---
  if (role === 'assembler') {
    const clearedTxns = await prisma.transaction.findMany({
      where: { glId: glId, periodId: periodId, cleared: true }
    });
    
    // Sum all the cleared items. If they don't net to zero, reject the signature!
    const netTotal = clearedTxns.reduce((sum, t) => sum + t.amount.toNumber(), 0);
    if (Math.abs(netTotal) >= 0.01) {
      throw new Error("Validation Failed: Cleared items must perfectly net to $0.00 to sign off.");
    }
  }

  const updateData: any = {};

  if (role === 'assembler') {
    updateData.assemblerId = user.id;
    updateData.assembledAt = now;
    updateData.status = 'IN_PROGRESS';
  } else if (role === 'reviewer') {
    updateData.reviewerId = user.id;
    updateData.reviewedAt = now;
  } else if (role === 'approver') {
    updateData.approverId = user.id;
    updateData.approvedAt = now;
    updateData.status = 'COMPLETED';
  }

  // Save the Signature
  await prisma.accountReconciliation.upsert({
    where: { glId_periodId: { glId: glId, periodId: periodId } },
    create: {
      glId: glId,
      periodId: periodId,
      status: role === 'assembler' ? 'IN_PROGRESS' : 'PENDING',
      assemblerId: role === 'assembler' ? user.id : null,
      assembledAt: role === 'assembler' ? now : null,
    },
    update: updateData
  });

  // --- 2. ROLL FORWARD UNCLEARED ITEMS ON FINAL APPROVAL ---
  if (role === 'approver') {
    let year = parseInt(periodId.substring(0, 4));
    let month = parseInt(periodId.substring(4, 6));
    month++;
    if (month > 12) { month = 1; year++; }
    const nextPeriodId = `${year}${month.toString().padStart(2, '0')}`;

    // Ensure the Next Period exists in the database
    await prisma.financialPeriod.upsert({
      where: { id: nextPeriodId },
      create: { id: nextPeriodId, isClosed: false },
      update: {}
    });

    // Physically move all unresolved rows into the next month
    await prisma.transaction.updateMany({
      where: {
        glId: glId,
        periodId: periodId,
        cleared: false // ONLY grab the ones that didn't reconcile
      },
      data: {
        periodId: nextPeriodId 
      }
    });
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function unsign(glId: string, periodId: string, role: 'assembler' | 'reviewer' | 'approver') {
  const user = await ensureUser(); 
  const updateData: any = {};

  if (role === 'assembler') {
    updateData.assemblerId = null;
    updateData.assembledAt = null;
    updateData.status = 'PENDING';
  } else if (role === 'reviewer') {
    updateData.reviewerId = null;
    updateData.reviewedAt = null;
  } else if (role === 'approver') {
    updateData.approverId = null;
    updateData.approvedAt = null;
    updateData.status = 'IN_PROGRESS';
  }

  await prisma.accountReconciliation.update({
    where: { glId_periodId: { glId: glId, periodId: periodId } },
    data: updateData
  });

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function rejectWorkflow(glId: string, periodId: string, level: 'reviewer' | 'approver') {
  const updateData: any = {};
  
  if (level === 'reviewer') {
    updateData.assemblerId = null;
    updateData.assembledAt = null;
    updateData.status = 'PENDING';
  } else if (level === 'approver') {
    updateData.assemblerId = null;
    updateData.assembledAt = null;
    updateData.reviewerId = null;
    updateData.reviewedAt = null;
    updateData.status = 'PENDING';
  }

  await prisma.accountReconciliation.update({
    where: { glId_periodId: { glId: glId, periodId: periodId } },
    data: updateData
  });

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function saveAdjustments(transactions: { id: string, file: string | null }[]) {
  const user = await ensureUser(); 

  for (const txn of transactions) {
    if (txn.file !== undefined) {
      await prisma.transaction.update({
        where: { id: txn.id },
        data: { supportFileUrl: txn.file } 
      });
    }
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function toggleClearedStatus(transactionIds: string[], cleared: boolean) {
  const user = await ensureUser(); 

  await prisma.transaction.updateMany({
    where: { id: { in: transactionIds } },
    data: { cleared }
  });

  revalidatePath('/', 'layout');
  return { success: true };
}

// --- BALANCE SHEET DASHBOARD ACTIONS (3-COLUMN LOGIC) ---

export async function getUserEntities() {
  const user = await ensureUser();
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return await prisma.entity.findMany({ orderBy: { code: 'asc' } });
  }
  return user.entities || [];
}

export async function getBalanceSheetData(entityCode: string) {
  const user = await ensureUser();

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    const hasAccess = user.entities?.some((e: any) => e.code === entityCode);
    if (!hasAccess) throw new Error("UNAUTHORIZED: You cannot view this entity.");
  }

  const glAccounts = await prisma.gLAccount.findMany({
    where: { entityCode },
    include: {
      reconciliations: true, 
      transactions: true
    },
    orderBy: { id: 'asc' }
  });

  return glAccounts.map(gl => {
    // 1. Get all unique periods that exist for this GL
    const allPeriodIds = [...new Set([
      ...gl.transactions.map(t => t.periodId), 
      ...gl.reconciliations.map(r => r.periodId)
    ])].sort().reverse(); 

    // 2. Find the last fully closed period
    let lastClosedPeriod = null;
    for (const pid of allPeriodIds) {
      const recon = gl.reconciliations.find(r => r.periodId === pid);
      if (recon?.status === 'COMPLETED') {
        if (!lastClosedPeriod) lastClosedPeriod = pid;
      }
    }

    // 3. Determine the Active Period (Using our Rollover Logic)
    let activePeriodId = allPeriodIds.length > 0 ? allPeriodIds[0] : null;

    if (activePeriodId) {
        const latestRecon = gl.reconciliations.find(r => r.periodId === activePeriodId);
        // If the latest period is closed, the active working period is the next month
        if (latestRecon && latestRecon.status === 'COMPLETED') {
             let year = parseInt(activePeriodId.substring(0,4));
             let month = parseInt(activePeriodId.substring(4,6));
             month++;
             if (month > 12) { month = 1; year++; }
             activePeriodId = `${year}${month.toString().padStart(2, '0')}`;
        }
    }

    // 4. Calculate the Balance for ONLY the Active Period
    const currentPeriodBalance = activePeriodId 
      ? gl.transactions.filter(t => t.periodId === activePeriodId).reduce((sum, t) => sum + t.amount.toNumber(), 0)
      : 0;

    return {
      glNumber: gl.id,
      description: gl.description,
      lastClosedPeriod,
      activePeriodId,
      currentPeriodBalance
    };
  });
}