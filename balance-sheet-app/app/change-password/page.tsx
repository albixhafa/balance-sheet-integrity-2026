"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldAlert, Loader2 } from 'lucide-react';
import { forcePasswordChange } from '@/app/actions/auth';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      await forcePasswordChange(formData);
      
    // Force a hard reload to clear the Next.js cache and fetch the unlocked user!
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-amber-50 px-8 py-6 border-b border-amber-100 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-xl font-bold text-amber-900">Action Required</h1>
          <p className="text-sm text-amber-700 mt-2">
            You are using a temporary or compromised password. You must secure your account before accessing the financial system.
          </p>
        </div>

        {/* Form */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-3 bg-rose-50 border border-rose-200 text-rose-600 text-sm rounded-lg text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required 
                  name="newPassword" 
                  type="password" 
                  minLength={8}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  placeholder="Minimum 8 characters"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required 
                  name="confirmPassword" 
                  type="password" 
                  minLength={8}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  placeholder="Retype new password"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Secure My Account'}
            </button>
          </form>
        </div>
        
      </div>
    </div>
  );
}