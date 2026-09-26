"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/* Navigation convenience only. It moves people to the right screen; it does
 * not protect anything - every server action and the attachment route check
 * the session themselves. */
export default function AuthGuard({ user }: { user: { requiresPasswordChange: boolean } | null }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      if (pathname !== "/login") router.replace("/login");
      return;
    }
    if (user.requiresPasswordChange) {
      if (pathname !== "/change-password") router.replace("/change-password");
      return;
    }
    if (pathname === "/login" || pathname === "/change-password") router.replace("/");
  }, [user, pathname, router]);

  return null;
}
