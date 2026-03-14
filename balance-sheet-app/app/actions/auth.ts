"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export async function authenticateUser(email: string, pass: string) {
  if (!email || !pass) {
    return { success: false, error: "Email and password are required." };
  }

  // 1. Find the user (case-insensitive)
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  // 2. Standardize generic error so we don't leak which emails exist to hackers
  if (!user) {
    return { success: false, error: "Invalid credentials." };
  }

  // 3. Check System Statuses
  if (user.status !== "ACTIVE") {
    return { success: false, error: "Account deactivated. Contact an administrator." };
  }

  if (user.isLockedOut) {
    return { success: false, error: "Account locked due to too many failed attempts. Contact an administrator." };
  }

  // 4. Verify Password
  const isMatch = await bcrypt.compare(pass, user.passwordHash);

  if (!isMatch) {
    // Math for lockouts
    const newAttempts = user.failedLoginAttempts + 1;
    const lockAccount = newAttempts >= 5;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newAttempts,
        isLockedOut: lockAccount
      }
    });

    if (lockAccount) {
      return { success: false, error: "Account locked due to 5 failed login attempts. Contact an administrator." };
    } else {
      const remaining = 5 - newAttempts;
      return { success: false, error: `Invalid credentials. ${remaining} attempt(s) remaining.` };
    }
  }

  // 5. SUCCESS! Reset failure counters
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0 }
  });

  // 6. Create the Session Cookie (8 hours)
  const cookieStore = await cookies();
  cookieStore.set("session_userid", user.id, {
    httpOnly: true, // Prevents JavaScript hackers from stealing the cookie
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8 
  });

  // 7. Route Controller
  if (user.requiresPasswordChange) {
    return { success: true, redirectTo: "/change-password" };
  }

  return { success: true, redirectTo: "/" }; // Default dashboard
}

// --- GET LOGGED IN USER ---
export async function getLoggedInUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("session_userid")?.value;

  if (!userId) return null;

  // Fetch the basic info PLUS their security flags
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      name: true, 
      role: true, 
      email: true, 
      entities: true,
      requiresPasswordChange: true // <-- ADDED THIS!
    } 
  });

  return user;
}

// --- LOGOUT USER ---
export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete("session_userid");
  return { success: true };
}
// --- UPDATE PASSWORD ---
export async function updatePassword(password: string) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("session_userid")?.value;

  if (!userId) return { success: false, error: "Not authenticated" };

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashedPassword,
      requiresPasswordChange: false, // Unlocks the app if they had a temporary password
    }
  });

  return { success: true };
}

// --- FORCE PASSWORD CHANGE ---
export async function forcePasswordChange(formData: FormData) {
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  
  if (newPassword !== confirmPassword) {
    throw new Error("Passwords do not match.");
  }

  const cookieStore = await cookies();
  const userId = cookieStore.get("session_userid")?.value;

  if (!userId) throw new Error("Not authenticated");

  // Hash the new password (bcrypt is already imported at the top!)
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update the user and remove the security lock
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashedPassword,
      requiresPasswordChange: false 
    }
  });

  return { success: true };
}