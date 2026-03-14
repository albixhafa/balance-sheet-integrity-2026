"use client";

import React, { useState, useEffect } from 'react';
import { getLoggedInUser, updatePassword } from '@/app/actions/auth';
import { Shield, Key, Loader2, CheckCircle2, Building2 } from 'lucide-react';

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Fetch the live user data when the page loads
  useEffect(() => {
    getLoggedInUser().then(data => {
      setUser(data);
      setLoading(false);
    });
  }, []);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage({ text: 'Passwords do not match.', type: 'error' });
      return;
    }

    setSaving(true);
    const res = await updatePassword(password);
    if (res.success) {
      setMessage({ text: 'Password updated successfully!', type: 'success' });
      setPassword('');
      setConfirm('');
    } else {
      setMessage({ text: 'Failed to update password.', type: 'error' });
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 flex items-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Loading profile data...</div>;
  if (!user) return <div className="p-8 text-slate-500">Please log in to view this page.</div>;

  const initials = user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const roleName = user.role.replace('_', ' ');

  // Calculate permissions dynamically based on their role
  const accessLevels = 
    user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? ['Full Ledger Access', 'Approval Authority', 'User Management'] :
    user.role === 'APPROVER' ? ['Full Ledger Access', 'Approval Authority'] :
    user.role === 'REVIEWER' ? ['Ledger Review Access'] : 
    ['Data Entry & Assembly'];

  return (
    <div className="p-8 max-w-[1000px] mx-auto space-y-8 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your personal information and security settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left Column: Info, Access & Entities */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-sm">
              {initials}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
            <p className="text-sm font-semibold text-blue-600 capitalize">{roleName}</p>
            <p className="text-xs text-slate-500 mt-1">{user.email}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold text-sm uppercase tracking-wider">
              <Shield size={16} /> Access Level
            </div>
            <ul className="space-y-3">
              {accessLevels.map((level, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 size={16} className="text-emerald-500" /> {level}
                </li>
              ))}
            </ul>
          </div>

          {/* NEW: Assigned Entities Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold text-sm uppercase tracking-wider">
              <Building2 size={16} /> Assigned Entities
            </div>
            <ul className="space-y-3">
              {user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? (
                <li className="flex items-center gap-2 text-sm font-semibold text-purple-600">
                  <CheckCircle2 size={16} /> All System Entities
                </li>
              ) : user.entities && user.entities.length > 0 ? (
                user.entities.map((ent: any) => (
                  <li key={ent.code} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Building2 size={14} className="text-slate-400" /> {ent.code}
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-500 italic">No entities assigned.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Right Column: Password Change */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 h-fit">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <Key size={18} className="text-slate-500" />
            <h3 className="text-lg font-bold text-slate-900">Change Password</h3>
          </div>

          <form onSubmit={handlePasswordUpdate} className="space-y-5 max-w-md">
            {message.text && (
              <div className={`p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {message.text}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password</label>
              <input 
                type="password" 
                required 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters" 
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm New Password</label>
              <input 
                type="password" 
                required 
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-type new password" 
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={saving}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {saving ? <><Loader2 size={16} className="animate-spin" /> Updating...</> : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}