import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 1. Hash a new temporary password
    const newPassword = "123";
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 2. Force the update on the Admin account
    await prisma.user.update({
      where: { email: "albi@test.com" },
      data: {
        passwordHash: hashedPassword,
        failedLoginAttempts: 0,    // Unlocks the account if you got locked out
        isLockedOut: false,
        requiresPasswordChange: false 
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: "Admin password successfully reset!",
      email: "albi@test.com",
      newPassword: newPassword
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to reset password." });
  }
}