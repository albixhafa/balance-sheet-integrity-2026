"use client";

import React from 'react';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logoutUser } from '@/app/actions/auth';

export default function UserProfile({ user }: { user: any }) {
  const router = useRouter();

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault(); // Stop the Link from triggering when trying to log out
    await logoutUser();
    router.push('/login');
  };

  const displayName = user?.name || "Guest User";
  const displayRole = user?.role || "Not Logged In";
  
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="p-4 hover:bg-slate-800 transition-colors">
      <div className="flex items-center gap-3">
        {/* The entire left side is now a clickable link to /profile */}
        <Link href="/profile" className="flex items-center gap-3 flex-1 min-w-0 group cursor-pointer">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm group-hover:ring-2 group-hover:ring-blue-400 transition-all">
            {initials}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors">{displayName}</p>
            <p className="text-xs text-slate-400 truncate capitalize">
              {displayRole.replace('_', ' ').toLowerCase()}
            </p>
          </div>
        </Link>
        
        {/* Logout Button */}
        {user && (
          <button 
            onClick={handleLogout} 
            className="text-slate-400 hover:text-rose-400 transition-colors p-2 rounded-lg hover:bg-slate-700 z-10" 
            title="Sign Out"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </div>
  );
}