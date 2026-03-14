"use client";

import React, { useState, useEffect } from 'react';
import { Users, Building2, Plus, Ban, CheckCircle2, ChevronDown, ChevronRight, X, BookOpen, Loader2 } from 'lucide-react';
import { getAdminData, createEntity, createGLAccount, saveUser, toggleUserStatus, resetUserPassword } from '@/app/actions/admin';
import { getLoggedInUser } from '@/app/actions/auth';

type Tab = 'users' | 'entities';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [isLoading, setIsLoading] = useState(true);

  // --- Live Database State ---
  const [users, setUsers] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // --- UI State ---
  const [expandedEntities, setExpandedEntities] = useState<string[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [showGlModal, setShowGlModal] = useState<string | null>(null);

  // --- Form State ---
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'ASSEMBLER', isReadOnly: false });

  // --- Fetch Live Data ---
  const loadData = async () => {
    setIsLoading(true);
    try {
      const loggedInAdmin = await getLoggedInUser();
      if (loggedInAdmin) setCurrentUserEmail(loggedInAdmin.email);

      const data = await getAdminData();
      setUsers(data.users);
      setEntities(data.entities);
    } catch (error) {
      console.error("Failed to load admin data", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- Handlers ---
  const toggleEntityRow = (code: string) => setExpandedEntities(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const openUserModal = (user: any = null) => {
    if (user) {
      setEditingUserId(user.id);
      setUserForm({ name: user.name, email: user.email, role: user.role, isReadOnly: user.isReadOnly });
      setSelectedEntities(user.entities ? user.entities.map((e: any) => e.code) : []);
    } else {
      setEditingUserId(null);
      setUserForm({ name: '', email: '', role: 'ASSEMBLER', isReadOnly: false });
      setSelectedEntities([]);
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const formData = new FormData(e.currentTarget);
      const response = await saveUser(formData, selectedEntities, editingUserId || undefined);
      
      setShowUserModal(false);
      loadData();

      if (response?.tempPassword) {
        alert(`USER CREATED SUCCESSFULLY!\n\nTemporary Password: ${response.tempPassword}\n\nPlease copy this down and send it to the user.`);
      }

    } catch (error: any) {
      alert(`Failed to save user. Make sure the email is unique!`);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    try {
      await toggleUserStatus(userId, currentStatus);
      loadData();
    } catch (error) {
      alert("Failed to update user status.");
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm("Are you sure you want to reset this user's password?")) return;
    
    try {
      const response = await resetUserPassword(userId);
      loadData();
      alert(`PASSWORD RESET SUCCESSFUL!\n\nNew Temp Password: ${response.tempPassword}`);
    } catch (error) {
      alert("Failed to reset password.");
    }
  };

  // --- UPDATED: DOUBLE CONFIRMATION FOR NEW ENTITY ---
  const handleAddEntity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const firstConfirm = window.confirm(`Are you sure you want to create this new Entity?`);
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(`FINAL VERIFICATION: By clicking OK, you confirm the Entity Code and Name are exactly correct. Structural changes are permanent.`);
    if (!secondConfirm) return;

    try {
      await createEntity(new FormData(e.currentTarget));
      setShowEntityModal(false);
      loadData();
    } catch(err) { 
      alert("Error saving entity. Make sure the 6-character code is unique!");
    }
  };

  // --- UPDATED: DOUBLE CONFIRMATION FOR NEW GL ---
  const handleAddGl = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showGlModal) return;

    const firstConfirm = window.confirm(`Are you sure you want to create this new General Ledger account?`);
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(`FINAL VERIFICATION: By clicking OK, you confirm the GL Number and details are exactly correct. Structural changes to the ledger are permanent.`);
    if (!secondConfirm) return;

    try {
      await createGLAccount(showGlModal, new FormData(e.currentTarget));
      setShowGlModal(null);
      loadData();
    } catch(err) { 
      alert("Error saving GL. Make sure the GL number is unique!");
    }
  };

  if (isLoading) return <div className="flex h-full items-center justify-center p-8 text-slate-500"><Loader2 className="animate-spin mr-3" size={24} /> Loading database records...</div>;

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-8 bg-slate-50 min-h-full relative">
      
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Administration Panel</h1>
        <p className="text-sm text-slate-500 mt-1">Manage system access and financial structures.</p>
      </div>

      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab('users')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}><Users size={18} /> Users</button>
        <button onClick={() => setActiveTab('entities')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'entities' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}><Building2 size={18} /> Entities & GLs</button>
      </div>

      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="text-base font-semibold text-slate-800">User Management</h2>
            <button onClick={() => openUserModal()} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2 shadow-sm"><Plus size={16} /> New User</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Name & Email</th>
                  <th className="px-6 py-4 font-semibold">Title / Role</th>
                  <th className="px-6 py-4 font-semibold max-w-[200px]">Assigned Entities</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 && (<tr><td colSpan={5} className="p-6 text-center text-slate-500 italic">No users found.</td></tr>)}
                {users.map((user) => {
                  const isSelf = user.email === currentUserEmail;
                  
                  return (
                    <tr key={user.id} className={`transition-colors ${user.status === 'INACTIVE' ? 'bg-slate-50 opacity-75' : 'hover:bg-slate-50/80'}`}>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 flex items-center gap-2 mt-2">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          user.role === 'APPROVER' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          user.role === 'REVIEWER' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>{user.role}</span>
                        {user.isReadOnly && <span className="px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wide">Read-Only</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-xs font-medium max-w-[200px] leading-relaxed">
                        {user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' 
                          ? <span className="text-purple-600 font-semibold">All Entities</span> 
                          : user.entities && user.entities.length > 0 
                            ? user.entities.map((e: any) => e.code).join(', ') 
                            : <span className="text-slate-400 italic">None Assigned</span>}
                      </td>
                      <td className="px-6 py-4">
                        {user.isLockedOut ? (
                          <span className="flex items-center gap-1.5 text-rose-600 text-xs font-bold"><Ban size={14} /> LOCKED OUT</span>
                        ) : user.status === 'ACTIVE' ? (
                          <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold"><CheckCircle2 size={14} /> Active</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold"><Ban size={14} /> Deactivated</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isSelf ? (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200 uppercase tracking-wider">System Protected</span>
                        ) : (
                          <div className="flex justify-end items-center gap-3">
                            {(user.isLockedOut || user.requiresPasswordChange) && (
                              <button onClick={() => handleResetPassword(user.id)} className="text-amber-600 hover:text-amber-800 font-semibold text-xs transition-colors pr-3 border-r border-slate-200">Reset Pass</button>
                            )}
                            <button onClick={() => openUserModal(user)} className="text-blue-600 hover:text-blue-800 font-semibold text-xs transition-colors pr-3 border-r border-slate-200">Edit</button>
                            <button 
                              onClick={() => handleToggleStatus(user.id, user.status)}
                              className={`text-xs font-bold transition-colors ${user.status === 'ACTIVE' ? 'text-rose-600 hover:text-rose-800' : 'text-emerald-600 hover:text-emerald-800'}`}
                            >
                              {user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ENTITIES TAB */}
      {activeTab === 'entities' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="text-base font-semibold text-slate-800">Entity & GL Structure</h2>
            <button onClick={() => setShowEntityModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2 shadow-sm"><Plus size={16} /> New Entity</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold w-12"></th>
                  <th className="px-6 py-4 font-semibold">Entity Code</th>
                  <th className="px-6 py-4 font-semibold">Entity Name</th>
                  <th className="px-6 py-4 font-semibold">Accounts</th>
                  <th className="px-6 py-4 font-semibold text-right">System Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entities.length === 0 && (<tr><td colSpan={5} className="p-6 text-center text-slate-500 italic">No entities found.</td></tr>)}
                {entities.map((entity) => {
                  const isExpanded = expandedEntities.includes(entity.code);
                  return (
                    <React.Fragment key={entity.id}>
                      <tr className={`hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-slate-50/80' : ''}`}>
                        <td className="px-4 py-4 text-center"><button onClick={() => toggleEntityRow(entity.code)} className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-200">{isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button></td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">{entity.code}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{entity.name}</td>
                        <td className="px-6 py-4 font-medium text-slate-600">{entity.glAccounts?.length || 0} GLs</td>
                        <td className="px-6 py-4 text-right"><button onClick={() => setShowGlModal(entity.code)} className="text-xs font-bold px-3 py-1.5 rounded-md text-blue-600 bg-blue-50 hover:bg-blue-100">+ Add GL</button></td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="p-0 border-b border-slate-200 bg-slate-50/50">
                            <div className="pl-16 pr-6 py-4 border-l-4 border-l-blue-400">
                              {entity.glAccounts && entity.glAccounts.length > 0 ? (
                                <table className="w-full text-sm text-left bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                                    <tr><th className="px-4 py-3">GL Number</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Sub Accounts</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {entity.glAccounts.map((gl: any) => {
                                      const activeSubs = [gl.sub1Name, gl.sub2Name, gl.sub3Name, gl.sub4Name, gl.sub5Name, gl.sub6Name, gl.sub7Name, gl.sub8Name, gl.sub9Name, gl.sub10Name].filter(Boolean);
                                      return (
                                        <tr key={gl.id}>
                                          <td className="px-4 py-3 font-mono text-slate-700">{gl.id}</td>
                                          <td className="px-4 py-3 text-slate-600">{gl.description}</td>
                                          <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1.5">
                                              {activeSubs.map((sub, i) => <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 border border-slate-200">{sub}</span>)}
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              ) : (<div className="text-sm text-slate-500 italic py-2">No GL accounts assigned yet.</div>)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS (User, Entity, GL) remain the same */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">{editingUserId ? 'Edit User' : 'Create New User'}</h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                <input required name="name" type="text" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                <input required name="email" type="email" value={userForm.email} readOnly={!!editingUserId} onChange={e => setUserForm({...userForm, email: e.target.value})} className={`w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none ${editingUserId ? 'bg-slate-100 text-slate-500' : 'focus:ring-blue-500'}`} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Title / Role</label>
                <select name="role" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 bg-white">
                  <option value="ASSEMBLER">Assembler</option>
                  <option value="REVIEWER">Reviewer</option>
                  <option value="APPROVER">Approver</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Entities</label>
                {userForm.role === 'ADMIN' || userForm.role === 'SUPER_ADMIN' ? (
                  <div className="p-3 bg-slate-100 rounded-lg text-xs text-slate-600 border border-slate-200">
                    Admins automatically have access to all entities in the system.
                  </div>
                ) : (
                  <div className="max-h-32 overflow-y-auto border border-slate-300 rounded-lg p-3 space-y-2 bg-slate-50">
                    {entities.map(e => (
                      <label key={e.code} className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedEntities.includes(e.code)}
                          onChange={(ev) => {
                            if (ev.target.checked) setSelectedEntities([...selectedEntities, e.code]);
                            else setSelectedEntities(selectedEntities.filter(c => c !== e.code));
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-sm font-medium text-slate-700">{e.code} - {e.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-3 p-3 mt-2 bg-slate-50 rounded-lg border border-slate-200">
                <input name="isReadOnly" type="checkbox" checked={userForm.isReadOnly} onChange={e => setUserForm({...userForm, isReadOnly: e.target.checked})} className="w-4 h-4 text-purple-600 rounded cursor-pointer" />
                <div><p className="text-sm font-bold text-slate-800">Read-Only Access</p></div>
              </div>
              
              <div className="pt-4 mt-6 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowUserModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">{editingUserId ? 'Save Changes' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEntityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">Create New Entity</h3>
              <button onClick={() => setShowEntityModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddEntity} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Entity Code (6-Chars)</label>
                <input required autoFocus name="code" maxLength={6} pattern="[A-Za-z0-9]{1,6}" type="text" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm uppercase font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. ABC001" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Entity Name</label>
                <input required name="name" type="text" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Acme Holdings" />
              </div>
              <div className="pt-4 mt-6 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowEntityModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition">Save to Database</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGlModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><BookOpen size={18} className="text-blue-600"/> Assign New GL to {showGlModal}</h3>
              <button onClick={() => setShowGlModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            
            <div className="overflow-y-auto p-6">
              <form id="add-gl-form" onSubmit={handleAddGl} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">GL Number *</label>
                    <input required autoFocus name="id" type="text" maxLength={12} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. 100150000000" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">GL Description *</label>
                    <input required name="desc" type="text" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Cash - Payroll Account" />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-800 mb-3">Sub-Account Configuration (Optional)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="w-6 text-right text-xs font-bold text-slate-400">{index + 1}.</span>
                        <input 
                          name={`sub${index}`}
                          type="text" 
                          maxLength={10}
                          pattern="[A-Za-z0-9]{1,10}"
                          className="flex-1 border border-slate-300 rounded-md p-2 text-sm uppercase font-mono focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder={`Dimension ${index + 1}`} 
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
              <button type="button" onClick={() => setShowGlModal(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
              <button type="submit" form="add-gl-form" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition">Save GL Configuration</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}