import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck, Loader } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-7">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-blue-600 text-white"><ShieldCheck className="w-5 h-5" /></div>
          <div>
            <h1 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">SIDC Road</h1>
            <p className="text-[11px] text-gray-500 -mt-0.5">Defect Intelligence — sign in</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && (
            <div className="p-3 text-xs font-semibold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="you@pune.gov.in"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={busy}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? <><Loader className="w-4 h-4 animate-spin" /> Signing in…</> : <><LogIn className="w-4 h-4" /> Sign In</>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
