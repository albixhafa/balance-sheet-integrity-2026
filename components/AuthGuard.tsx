"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthGuard({ user }: { user: any }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 1. KICK OUT GUESTS: If they aren't logged in, force them to the Login screen.
    if (!user && pathname !== '/login') {
      router.push('/login');
      return;
    }

    // 2. TRAP TEMPORARY PASSWORDS: If they need to change their pass, force them to that screen.
    if (user && user.requiresPasswordChange && pathname !== '/change-password') {
      router.push('/change-password');
      return;
    }

    // 3. REDIRECT AUTHENTICATED USERS: If they are logged in and try to go to the login screen, send them home.
    if (user && !user.requiresPasswordChange && pathname === '/login') {
      router.push('/');
      return;
    }

    // 4. ADMIN ROUTE PROTECTION: Kick non-admins out of the /admin page.
    if (user && pathname.startsWith('/admin')) {
      if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
        router.push('/');
        return;
      }
    }

  }, [user, pathname, router]);

  return null; // This component is completely invisible
}