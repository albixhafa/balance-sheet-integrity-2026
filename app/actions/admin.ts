"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

// --- FETCH DATA ---
export async function getAdminData() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { entities: true }
  });

  const entities = await prisma.entity.findMany({
    orderBy: { code: 'asc' },
    include: { 
      glAccounts: {
        orderBy: { id: 'asc' }
      } 
    }
  });

  return { users, entities };
}

// --- SAVE OR UPDATE USER ---
export async function saveUser(formData: FormData, entityCodes: string[], existingUserId?: string) {
  const name = formData.get("name") as string; 
  const email = formData.get("email") as string;
  const role = formData.get("role") as any;
  const isReadOnly = formData.get("isReadOnly") === "on";

  // Admins get access to all, so we don't map specific entities to them
  const isSuper = role === "ADMIN" || role === "SUPER_ADMIN";
  const connectedEntities = isSuper ? [] : entityCodes.map(code => ({ code }));

  if (existingUserId) {
    // UPDATE EXISTING USER
    await prisma.user.update({
      where: { id: existingUserId },
      data: {
        name,
        email,
        role,
        isReadOnly,
        entities: {
          set: connectedEntities // 'set' wipes the old list and replaces it with the new one
        }
      }
    });
    
    revalidatePath("/admin");
    return { success: true };
    
  } else {
    // CREATE NEW USER
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await prisma.user.create({
      data: {
        name,
        email,
        role,
        isReadOnly,
        passwordHash: hashedPassword,
        requiresPasswordChange: true,
        status: "ACTIVE",
        entities: {
          connect: connectedEntities // 'connect' just links them up to the brand new user
        }
      }
    });

    revalidatePath("/admin");
    return { success: true, tempPassword }; 
  }
}

// --- TOGGLE USER STATUS ---
export async function toggleUserStatus(userId: string, currentStatus: string) {
  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  
  await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus as any }
  });

  revalidatePath("/admin");
}

// --- CREATE ENTITY ---
export async function createEntity(formData: FormData) {
  const code = formData.get("code") as string;
  const name = formData.get("name") as string;

  if (!code || !name) throw new Error("Code and Name are required");

  await prisma.entity.create({
    data: {
      code: code.toUpperCase(),
      name,
      status: "ACTIVE",
    }
  });

  revalidatePath("/admin");
}

// --- CREATE GL ACCOUNT ---
export async function createGLAccount(entityCode: string, formData: FormData) {
  const id = formData.get("id") as string;
  const description = formData.get("desc") as string;
  
  const subs = [];
  for (let i = 0; i < 10; i++) {
    const val = formData.get(`sub${i}`) as string;
    subs.push(val ? val.trim() : null);
  }

  await prisma.gLAccount.create({
    data: {
      id,
      description,
      entityCode,
      status: "ACTIVE",
      sub1Name: subs[0],
      sub2Name: subs[1],
      sub3Name: subs[2],
      sub4Name: subs[3],
      sub5Name: subs[4],
      sub6Name: subs[5],
      sub7Name: subs[6],
      sub8Name: subs[7],
      sub9Name: subs[8],
      sub10Name: subs[9],
    }
  });

  revalidatePath("/admin");
}

// --- GENERATE NEW TEMP PASSWORD & UNLOCK ---
export async function resetUserPassword(userId: string) {
  // Generate a new 8-character password
  const tempPassword = Math.random().toString(36).slice(-8);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashedPassword,
      requiresPasswordChange: true, // Forces them to change it again
      failedLoginAttempts: 0,       // Reset their failure counter
      isLockedOut: false,           // Unlock the account!
    }
  });

  revalidatePath("/admin");
  return { success: true, tempPassword };
}