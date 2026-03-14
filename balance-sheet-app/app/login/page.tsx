"use client";

import React, { useState } from 'react';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authenticateUser } from '@/app/actions/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Send the data to our secure PostgreSQL backend
      const result = await authenticateUser(email, password);
      
      if (!result.success) {
        setError(result.error || "Invalid credentials.");
        setIsLoading(false);
        return;
      }

      // If successful, push them to the route the backend decided on
      if (result.redirectTo) {
        router.push(result.redirectTo);
      }

    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
      
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 relative z-10 overflow-hidden">
        
        <div className="p-8 pb-6 border-b border-slate-100 bg-slate-50/50">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-6 shadow-md">
            <Lock className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign In</h1>
          <p className="text-sm text-slate-500 mt-1.5">Enter your credentials to access the Balance Sheet Reconciliation System.</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          
          {/* Dynamic Error Message Box */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
              <p className="text-sm font-medium text-rose-800 leading-snug">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="text-slate-400" size={18} />
                </div>
                <input 
                  type="email" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" 
                  placeholder="name@company.com" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="text-slate-400" size={18} />
                </div>
                <input 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" 
                  placeholder="••••••••" 
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? <><Loader2 size={18} className="animate-spin" /> Verifying...</> : 'Sign In'}
          </button>
          
          <div className="text-center mt-6">
            <p className="text-xs text-slate-500">Locked out? Contact your system administrator.</p>
          </div>
        </form>
      </div>
    </div>
  );
}