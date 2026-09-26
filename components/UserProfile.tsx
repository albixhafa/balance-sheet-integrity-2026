"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/format";

export default function UserProfile({ user }: { user: { name: string; role: string; isReadOnly: boolean } | null }) {
  const handleLogout = async () => {
    await logout();
    // A full navigation, so no page keeps rendering data from the old session.
    window.location.href = "/balancesheet/login";
  };

  const name = user?.name || "Not signed in";
  const initials = name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="p-3 flex items-center gap-3">
      <Link href="/profile" className="flex items-center gap-3 flex-1 min-w-0 group">
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 group-hover:ring-2 group-hover:ring-blue-400 transition-all">
          {initials || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition-colors">{name}</p>
          <p className="text-xs text-slate-400 truncate">
            {user ? ROLE_LABEL[user.role] ?? user.role : ""}{user?.isReadOnly ? " · Read-only" : ""}
          </p>
        </div>
      </Link>
      {user && (
        <button onClick={handleLogout} title="Sign out" aria-label="Sign out"
          className="text-slate-400 hover:text-rose-400 transition-colors p-2 rounded-lg hover:bg-slate-700">
          <LogOut size={18} />
        </button>
      )}
    </div>
  );
}
