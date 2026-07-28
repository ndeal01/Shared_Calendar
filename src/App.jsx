import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { useToast } from './context/ToastContext';
import { formatDateLabel, formatMonthLabel } from './data/sampleData';
import { hasSupabaseConfig } from './supabaseClient';
import { WEEKDAY_LABELS, getEventOccurrences, eventOccursOnDate } from './utils/recurrence';
import ErrorBoundary from './components/ErrorBoundary';

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDates(referenceDate) {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function ProtectedRoute({ children }) {
  const { user, authReady, family, familyReady } = useApp();

  if (!authReady || !familyReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm font-medium text-slate-500">
        Loading your calendar…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!family) return <Navigate to="/onboarding" replace />;

  return children;
}

function OnboardingRoute({ children }) {
  const { user, authReady, family, familyReady } = useApp();

  if (!authReady || !familyReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm font-medium text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (family) return <Navigate to="/" replace />;

  return children;
}

function NotificationBell() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp();
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Notifications"
        className="relative rounded-full border border-slate-300 p-2 text-slate-700 hover:bg-slate-100"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Notifications</p>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllNotificationsRead} className="text-xs font-semibold text-teal-600">
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    to={notification.occurrence_date ? `/day/${notification.occurrence_date}` : '/'}
                    onClick={() => {
                      if (!notification.read) markNotificationRead(notification.id);
                      setOpen(false);
                    }}
                    className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-slate-50 ${notification.read ? 'text-slate-500' : 'bg-teal-50 font-medium text-slate-800'}`}
                  >
                    {notification.message}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AppShell({ children }) {
  const { user, family, logout } = useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setSidebarOpen(false);
    navigate('/login');
  };

  const navLinks = [
    ['/', 'Calendar'],
    ['/week/today', 'Week'],
    ['/day/today', 'Today'],
    ['/members', 'Members'],
    ['/settings', 'Settings']
  ];

  const showNav = user && family;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">Family Calendar</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{family?.name || 'Family Calendar'}</h1>
      </div>

      {showNav && (
        <nav className="flex-1 space-y-1 px-3">
          {navLinks.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              end={to === '/'}
              className={({ isActive }) => `block rounded-2xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      )}

      {!showNav && <div className="flex-1" />}

      <div className="border-t border-slate-200 px-5 py-4">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{user.displayName}</span>
              {family && <NotificationBell />}
            </div>
            <button onClick={handleLogout} className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Sign out
            </button>
          </div>
        ) : (
          <Link to="/login" onClick={() => setSidebarOpen(false)} className="block rounded-full bg-teal-600 px-3 py-2 text-center text-sm font-medium text-white">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="rounded-full border border-slate-300 p-2 text-slate-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="text-base font-semibold">{family?.name || 'Family Calendar'}</h1>
        {user && family ? <NotificationBell /> : <span className="w-9" />}
      </header>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="rounded-full border border-slate-300 p-2 text-slate-700">
                ✕
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        {sidebarContent}
      </aside>

      <main className="flex-1 px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

function LoginPage() {
  const { user, authReady, signUp, signIn } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (authReady && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    if (hasSupabaseConfig && !password) {
      setError('Password is required');
      return;
    }

    setError('');
    setNotice('');
    setSubmitting(true);

    const result = mode === 'signup'
      ? await signUp(email.trim(), password, displayName.trim())
      : await signIn(email.trim(), password);

    setSubmitting(false);

    if (result?.error) {
      setError(result.error.message || 'Something went wrong');
      return;
    }

    if (result?.needsEmailConfirmation) {
      setNotice('Check your email to confirm your account, then sign in.');
      setMode('signin');
      return;
    }

    navigate('/');
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">Welcome</p>
      <h2 className="mt-2 text-2xl font-semibold">{mode === 'signup' ? 'Create your account' : 'Sign in to your family calendar'}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {hasSupabaseConfig
          ? 'Your account and family data are securely stored and synced across devices.'
          : 'This demo uses a local session so you can explore the experience right away.'}
      </p>

      <div className="mt-4 flex gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold">
        <button type="button" onClick={() => { setMode('signin'); setError(''); }} className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'signin' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
          Sign in
        </button>
        <button type="button" onClick={() => { setMode('signup'); setError(''); }} className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'signup' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="you@example.com" />
        </label>
        {hasSupabaseConfig && (
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="••••••••" />
          </label>
        )}
        {mode === 'signup' && (
          <label className="block text-sm font-medium text-slate-700">
            Display name (optional)
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="Mom" />
          </label>
        )}
        {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        {notice && <p className="rounded-2xl bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700">{notice}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
          {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Continue'}
        </button>
        {mode === 'signin' && hasSupabaseConfig && (
          <Link to="/forgot-password" className="block text-center text-sm font-medium text-teal-700 hover:underline">
            Forgot your password?
          </Link>
        )}
      </form>
    </div>
  );
}

function ForgotPasswordPage() {
  const { requestPasswordReset } = useApp();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;

    setError('');
    setSubmitting(true);
    const { error } = await requestPasswordReset(email.trim());
    setSubmitting(false);

    if (error) {
      setError(error.message || 'Something went wrong');
      return;
    }

    setSent(true);
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">Reset password</p>
      <h2 className="mt-2 text-2xl font-semibold">Forgot your password?</h2>
      <p className="mt-2 text-sm text-slate-600">Enter your email and we'll send you a link to reset your password.</p>

      {sent ? (
        <div className="mt-6 rounded-2xl bg-teal-50 px-3 py-3 text-sm font-medium text-teal-700">
          Check your email for a password reset link.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="you@example.com" />
          </label>
          {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <Link to="/login" className="mt-4 block text-center text-sm font-medium text-teal-700 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}

function ResetPasswordPage() {
  const { updatePassword } = useApp();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);

    if (error) {
      setError(error.message || 'Something went wrong');
      return;
    }

    setDone(true);
    // Use a full page reload (not client-side navigate) so the app re-mounts
    // fresh and re-fetches the session + family from scratch. Updating the
    // password mid-recovery-session can momentarily disturb the in-memory
    // auth state in ways that make the existing family-loading effect skip
    // a re-fetch, which was stranding already-set-up users on /onboarding.
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">Reset password</p>
      <h2 className="mt-2 text-2xl font-semibold">Choose a new password</h2>

      {done ? (
        <div className="mt-6 rounded-2xl bg-teal-50 px-3 py-3 text-sm font-medium text-teal-700">
          Password updated! Taking you to your calendar…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="••••••••" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm new password
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={6} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="••••••••" />
          </label>
          {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {submitting ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </div>
  );
}

function OnboardingPage() {
  const { user, createFamily, joinFamily } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('create');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!familyName.trim()) return;
    setError('');
    setSubmitting(true);
    const result = await createFamily(familyName.trim());
    setSubmitting(false);
    if (result?.error) {
      setError(result.error.message || 'Unable to create family');
      return;
    }
    navigate('/');
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    if (!inviteCode.trim()) return;
    setError('');
    setSubmitting(true);
    const result = await joinFamily(inviteCode.trim());
    setSubmitting(false);
    if (result?.error) {
      setError(result.error.message || 'Unable to join family');
      return;
    }
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">Welcome{user?.displayName ? `, ${user.displayName}` : ''}</p>
      <h2 className="mt-2 text-2xl font-semibold">Set up your family calendar</h2>
      <p className="mt-2 text-sm text-slate-600">Create a brand new family calendar, or join one using an invite code from a family member.</p>

      <div className="mt-4 flex gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold">
        <button type="button" onClick={() => { setTab('create'); setError(''); }} className={`flex-1 rounded-full px-3 py-2 transition ${tab === 'create' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
          Create family
        </button>
        <button type="button" onClick={() => { setTab('join'); setError(''); }} className={`flex-1 rounded-full px-3 py-2 transition ${tab === 'join' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>
          Join with code
        </button>
      </div>

      {tab === 'create' ? (
        <form onSubmit={handleCreate} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Family name
            <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="The Smiths" />
          </label>
          {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {submitting ? 'Creating…' : 'Create family calendar'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Invite code
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0 uppercase tracking-widest" placeholder="FAMILY123" />
          </label>
          {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {submitting ? 'Joining…' : 'Join family'}
          </button>
        </form>
      )}
    </div>
  );
}

function HomePage() {
  const { events, members, currentMonth, setCurrentMonth, addMember } = useApp();
  const toast = useToast();
  const [addingMember, setAddingMember] = useState(false);

  const handleQuickAddMember = async () => {
    const name = prompt('Member name');
    if (!name || !name.trim()) return;
    setAddingMember(true);
    const { error } = await addMember(name.trim(), '#3b82f6');
    setAddingMember(false);
    if (error) toast.error(error);
  };

  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const monthDays = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = (monthStart.getDay() + 6) % 7;
  const cells = [];
  const todayKey = formatDateKey(new Date());

  for (let index = 0; index < firstDay; index += 1) cells.push(null);
  for (let day = 1; day <= monthDays; day += 1) cells.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);

  const dayEvents = useMemo(() => {
    return (dateKey) => events.filter((event) => eventOccursOnDate(event, dateKey));
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const rangeEndDate = new Date();
    rangeEndDate.setDate(rangeEndDate.getDate() + 90);
    const rangeEndKey = formatDateKey(rangeEndDate);

    const occurrences = events.flatMap((event) =>
      getEventOccurrences(event, todayKey, rangeEndKey).map((occurrenceDate) => ({ event, occurrenceDate }))
    );

    return occurrences
      .sort((left, right) => {
        if (left.occurrenceDate === right.occurrenceDate) {
          return (left.event.startTime || '').localeCompare(right.event.startTime || '');
        }

        return left.occurrenceDate.localeCompare(right.occurrenceDate);
      })
      .slice(0, 3)
      .map(({ event, occurrenceDate }) => ({ ...event, date: occurrenceDate }));
  }, [events, todayKey]);

  return (
    <div className="space-y-6">
      {members.length === 0 && events.length === 0 ? (
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm text-center">
          <h2 className="text-2xl font-semibold">Start your first family calendar</h2>
          <p className="mt-2 text-sm text-slate-600">Add family members and schedule your first event — everything will sync across devices if Supabase is configured.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button onClick={handleQuickAddMember} disabled={addingMember} className="rounded-full bg-teal-600 px-4 py-2 text-white font-semibold disabled:opacity-60">
              {addingMember ? 'Adding…' : 'Add a family member'}
            </button>
            <button onClick={() => window.location.href = '/event/new'} className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700">Create an event</button>
          </div>
        </div>
      ) : (
        <>
        <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-teal-600 to-cyan-600 p-4 text-white shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{upcomingEvents.length > 0 ? 'Upcoming family plans' : 'Your calendar is clear'}</h3>
          </div>
          <button onClick={() => setCurrentMonth(new Date())} className="rounded-full border border-white/30 bg-white/15 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/25">
            Jump to today
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="text-sm text-teal-50/90">{formatDateLabel(event.date)}{event.allDay ? '' : ` • ${event.startTime || '--'}`}</p>
                  </div>
                  <Link to={`/day/${event.date}`} className="text-sm font-semibold text-white/90 hover:text-white">
                    View
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-teal-50/90">
              Nothing is scheduled from today onward yet.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-700">
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Month view</p>
          <h2 className="text-lg font-semibold sm:text-xl">{formatMonthLabel(currentMonth)}</h2>
        </div>
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-700">
          Next →
        </button>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:mb-3 sm:gap-2 sm:text-xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="aspect-square rounded-2xl border border-transparent bg-slate-50/80" />;
            }

            const dateKey = formatDateKey(date);
            const isToday = dateKey === formatDateKey(new Date());
            const matchingEvents = dayEvents(dateKey);

            return (
              <Link
                key={dateKey}
                to={`/day/${dateKey}`}
                className={`group flex aspect-square flex-col rounded-2xl border p-1.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-2 ${isToday ? 'border-teal-500 bg-gradient-to-br from-teal-50 to-white' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-semibold sm:text-sm ${isToday ? 'text-teal-700' : 'text-slate-700'}`}>{date.getDate()}</span>
                  {matchingEvents.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 sm:text-[10px]">{matchingEvents.length}</span>
                  )}
                </div>
                {matchingEvents.length > 0 && (
                  <div className="mt-1 flex flex-1 items-end justify-center gap-0.5 sm:hidden">
                    {matchingEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                    ))}
                  </div>
                )}
                <div className="mt-1 hidden flex-1 space-y-1 overflow-hidden sm:block">
                  {matchingEvents.slice(0, 2).map((event) => (
                    <div key={event.id} className="truncate rounded-lg bg-slate-100 px-1.5 py-1 text-[10px] font-medium text-slate-700">
                      {event.title}
                    </div>
                  ))}
                  {matchingEvents.length > 2 && (
                    <div className="text-[10px] font-semibold text-slate-500">+{matchingEvents.length - 2} more</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      </>
    )}
    </div>
  );
}
 
function WeekPage() {
  const { dateKey } = useParams();
  const { events } = useApp();
  const navigate = useNavigate();
  const resolvedDate = dateKey === 'today' ? new Date() : new Date(`${dateKey}T12:00:00`);
  const weekDates = getWeekDates(resolvedDate);
  const weekLabel = `${formatDateLabel(formatDateKey(weekDates[0]))} – ${formatDateLabel(formatDateKey(weekDates[6]))}`;

  const goToPreviousWeek = () => {
    const nextDate = new Date(resolvedDate);
    nextDate.setDate(nextDate.getDate() - 7);
    navigate(`/week/${formatDateKey(nextDate)}`);
  };

  const goToNextWeek = () => {
    const nextDate = new Date(resolvedDate);
    nextDate.setDate(nextDate.getDate() + 7);
    navigate(`/week/${formatDateKey(nextDate)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={goToPreviousWeek} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">← Prev</button>
          <button onClick={() => navigate('/week/today')} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">Today</button>
          <button onClick={goToNextWeek} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">Next →</button>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Week view</p>
          <h2 className="text-xl font-semibold">{weekLabel}</h2>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-7">
        {weekDates.map((date) => {
          const dateKey = formatDateKey(date);
          const matchingEvents = events.filter((event) => eventOccursOnDate(event, dateKey));
          const isToday = dateKey === formatDateKey(new Date());

          return (
            <Link key={dateKey} to={`/day/${dateKey}`} className={`rounded-[1.5rem] border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isToday ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date)}</p>
                  <h3 className={`mt-1 text-lg font-semibold ${isToday ? 'text-teal-700' : 'text-slate-900'}`}>{date.getDate()}</h3>
                </div>
                {matchingEvents.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{matchingEvents.length}</span>}
              </div>
              <div className="mt-3 space-y-2">
                {matchingEvents.length === 0 ? (
                  <div className="rounded-xl bg-white/60 px-2 py-2 text-xs text-slate-500">No events</div>
                ) : (
                  matchingEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className="rounded-xl bg-slate-100 px-2 py-2 text-xs text-slate-700">
                      <p className="font-semibold">{event.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{event.allDay ? 'All day' : event.startTime || '--'}</p>
                    </div>
                  ))
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DayPage() {
  const { dateKey } = useParams();
  const { events, members, deleteEvent, isOccurrenceComplete, toggleTaskCompletion } = useApp();
  const toast = useToast();
  const resolvedDateKey = dateKey === 'today' ? formatDateKey(new Date()) : dateKey;
  const [activeMemberId, setActiveMemberId] = useState('all');
  const [pendingTaskKey, setPendingTaskKey] = useState(null);
  const [deletingEventId, setDeletingEventId] = useState(null);
  const dayEvents = events.filter((event) => eventOccursOnDate(event, resolvedDateKey));
  const filteredEvents = dayEvents.filter((event) => activeMemberId === 'all' || event.assignedMemberIds.includes(activeMemberId));
  const dateLabel = formatDateLabel(resolvedDateKey);

  const handleToggleTask = async (eventId) => {
    const key = `${eventId}:${resolvedDateKey}`;
    setPendingTaskKey(key);
    const { error } = await toggleTaskCompletion(eventId, resolvedDateKey);
    setPendingTaskKey((current) => (current === key ? null : current));
    if (error) toast.error(error);
  };

  const handleDeleteEvent = async (event) => {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    setDeletingEventId(event.id);
    const { error } = await deleteEvent(event.id);
    setDeletingEventId(null);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`"${event.title}" was deleted.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Day view</p>
          <h2 className="text-xl font-semibold">{dateLabel}</h2>
        </div>
        <Link to={`/event/new?date=${resolvedDateKey}`} className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
          + Add event
        </Link>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveMemberId('all')} className={`rounded-full px-3 py-2 text-sm font-medium ${activeMemberId === 'all' ? 'bg-teal-600 text-white' : 'border border-slate-200 text-slate-700'}`}>
            All members
          </button>
          {members.map((member) => (
            <button key={member.id} type="button" onClick={() => setActiveMemberId(member.id)} className={`rounded-full px-3 py-2 text-sm font-medium ${activeMemberId === member.id ? 'text-white' : 'border border-slate-200 text-slate-700'}`} style={activeMemberId === member.id ? { backgroundColor: member.color } : {}}>
              {member.name}
            </button>
          ))}
        </div>
        {dayEvents.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No events yet for this day. Tap add event to create one.
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No events for this member on this day.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((event) => {
              const assignedMembers = members.filter((member) => event.assignedMemberIds.includes(member.id));
              const isComplete = event.isTask && isOccurrenceComplete(event.id, resolvedDateKey);
              return (
                <div key={event.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {event.isTask && (
                        <button
                          type="button"
                          onClick={() => handleToggleTask(event.id)}
                          disabled={pendingTaskKey === `${event.id}:${resolvedDateKey}`}
                          aria-label={isComplete ? 'Mark as not done' : 'Mark as done'}
                          className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition disabled:opacity-50 ${isComplete ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 text-transparent hover:border-teal-500'}`}
                        >
                          ✓
                        </button>
                      )}
                      <div>
                        <h3 className={`text-lg font-semibold ${isComplete ? 'text-slate-400 line-through' : ''}`}>{event.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{event.allDay ? 'All day' : `${event.startTime || '--'} – ${event.endTime || '--'}`}</p>
                        {event.recurrenceFreq && event.recurrenceFreq !== 'none' && (
                          <p className="mt-1 text-xs font-medium text-teal-700">🔁 Repeats {event.recurrenceFreq}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/event/${event.id}/edit`} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium">Edit</Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(event)}
                        disabled={deletingEventId === event.id}
                        className="rounded-full border border-rose-200 px-3 py-1 text-sm font-medium text-rose-600 disabled:opacity-50"
                      >
                        {deletingEventId === event.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  {(event.location || event.notes) && (
                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      {event.location && <p>📍 {event.location}</p>}
                      {event.notes && <p>📝 {event.notes}</p>}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assignedMembers.map((member) => (
                      <span key={member.id} className="rounded-full px-2.5 py-1 text-sm text-white" style={{ backgroundColor: member.color }}>
                        {member.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EventFormPage() {
  const { eventId } = useParams();
  const { events, members, addEvent, updateEvent } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingEvent = events.find((event) => event.id === eventId);
  const initialDate = searchParams.get('date') || existingEvent?.date || '';
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: existingEvent?.title || '',
    date: initialDate,
    startTime: existingEvent?.startTime || '09:00',
    endTime: existingEvent?.endTime || '10:00',
    allDay: existingEvent?.allDay || false,
    location: existingEvent?.location || '',
    notes: existingEvent?.notes || '',
    assignedMemberIds: existingEvent?.assignedMemberIds || [],
    isTask: existingEvent?.isTask || false,
    recurrenceFreq: existingEvent?.recurrenceFreq || 'none',
    recurrenceInterval: existingEvent?.recurrenceInterval || 1,
    recurrenceDaysOfWeek: existingEvent?.recurrenceDaysOfWeek || [],
    recurrenceEndDate: existingEvent?.recurrenceEndDate || '',
    reminderMinutesBefore: existingEvent
      ? existingEvent.reminderMinutesBefore ?? ''
      : 30
  });

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleMemberToggle = (memberId) => {
    setForm((current) => ({
      ...current,
      assignedMemberIds: current.assignedMemberIds.includes(memberId)
        ? current.assignedMemberIds.filter((currentId) => currentId !== memberId)
        : [...current.assignedMemberIds, memberId]
    }));
  };

  const handleWeekdayToggle = (dayIndex) => {
    setForm((current) => ({
      ...current,
      recurrenceDaysOfWeek: current.recurrenceDaysOfWeek.includes(dayIndex)
        ? current.recurrenceDaysOfWeek.filter((d) => d !== dayIndex)
        : [...current.recurrenceDaysOfWeek, dayIndex].sort()
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!form.title.trim()) {
      setFormError('Please enter a title for this event.');
      return;
    }
    if (!form.date) {
      setFormError('Please choose a date for this event.');
      return;
    }
    if (!form.allDay && form.startTime && form.endTime && form.endTime <= form.startTime) {
      setFormError('End time must be after the start time.');
      return;
    }
    const recurrenceInterval = Number(form.recurrenceInterval);
    if (form.recurrenceFreq !== 'none' && (!Number.isFinite(recurrenceInterval) || recurrenceInterval < 1)) {
      setFormError('Repeat interval must be at least 1.');
      return;
    }
    if (form.recurrenceFreq === 'weekly' && form.recurrenceDaysOfWeek.length === 0) {
      setFormError('Pick at least one day of the week for a weekly repeat.');
      return;
    }
    if (form.recurrenceFreq !== 'none' && form.recurrenceEndDate && form.recurrenceEndDate < form.date) {
      setFormError('The repeat end date must be on or after the event date.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      allDay: form.allDay,
      location: form.location.trim(),
      notes: form.notes.trim(),
      assignedMemberIds: form.assignedMemberIds,
      isTask: form.isTask,
      recurrenceFreq: form.recurrenceFreq,
      recurrenceInterval: recurrenceInterval || 1,
      recurrenceDaysOfWeek: form.recurrenceFreq === 'weekly' ? form.recurrenceDaysOfWeek : [],
      recurrenceEndDate: form.recurrenceEndDate || null,
      reminderMinutesBefore: form.reminderMinutesBefore === '' ? null : Number(form.reminderMinutesBefore)
    };

    setSaving(true);
    const { error } = existingEvent ? await updateEvent(existingEvent.id, payload) : await addEvent(payload);
    setSaving(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success(existingEvent ? 'Event updated.' : 'Event created.');
    navigate(`/day/${form.date}`);
  };

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">{existingEvent ? 'Edit event' : 'New event'}</p>
        <h2 className="mt-2 text-2xl font-semibold">{existingEvent ? 'Update the event details' : 'Create a family event'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-medium text-slate-700">
          Title
          <input name="title" value={form.title} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2" placeholder="Basketball practice" />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Date
            <input name="date" type="date" value={form.date} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700">
            <input name="allDay" type="checkbox" checked={form.allDay} onChange={handleChange} />
            All day event
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Start
            <input name="startTime" type="time" value={form.startTime} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            End
            <input name="endTime" type="time" value={form.endTime} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2" />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Location
          <input name="location" value={form.location} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2" placeholder="Park" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Notes
          <textarea name="notes" value={form.notes} onChange={handleChange} className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 px-3 py-2" placeholder="Bring snacks" />
        </label>

        <div>
          <p className="text-sm font-medium text-slate-700">Assigned family members</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {members.map((member) => (
              <button key={member.id} type="button" onClick={() => handleMemberToggle(member.id)} className={`rounded-full px-3 py-2 text-sm font-medium ${form.assignedMemberIds.includes(member.id) ? 'text-white' : 'border border-slate-200 text-slate-700'}`} style={form.assignedMemberIds.includes(member.id) ? { backgroundColor: member.color } : {}}>
                {member.name}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700">
          <input name="isTask" type="checkbox" checked={form.isTask} onChange={handleChange} />
          Make this a to-do item (can be checked off when done)
        </label>

        {!form.allDay && (
          <label className="block text-sm font-medium text-slate-700">
            Remind me
            <select name="reminderMinutesBefore" value={form.reminderMinutesBefore} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2">
              <option value="">No reminder</option>
              <option value="0">At start time</option>
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="20">20 minutes before</option>
              <option value="25">25 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="45">45 minutes before</option>
              <option value="60">1 hour before</option>
            </select>
          </label>
        )}

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-700">Repeats</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Frequency
              <select name="recurrenceFreq" value={form.recurrenceFreq} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2">
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            {form.recurrenceFreq !== 'none' && (
              <label className="block text-sm font-medium text-slate-700">
                Every
                <div className="mt-2 flex items-center gap-2">
                  <input name="recurrenceInterval" type="number" min="1" value={form.recurrenceInterval} onChange={handleChange} className="w-20 rounded-2xl border border-slate-200 px-3 py-2" />
                  <span className="text-sm text-slate-500">
                    {form.recurrenceFreq === 'daily' ? 'day(s)' : form.recurrenceFreq === 'weekly' ? 'week(s)' : 'month(s)'}
                  </span>
                </div>
              </label>
            )}
          </div>

          {form.recurrenceFreq === 'weekly' && (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">On these days</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, index) => (
                  <button key={label} type="button" onClick={() => handleWeekdayToggle(index)} className={`h-9 w-9 rounded-full text-sm font-medium ${form.recurrenceDaysOfWeek.includes(index) ? 'bg-teal-600 text-white' : 'border border-slate-200 text-slate-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.recurrenceFreq !== 'none' && (
            <label className="mt-4 block text-sm font-medium text-slate-700">
              End date (optional)
              <input name="recurrenceEndDate" type="date" value={form.recurrenceEndDate} onChange={handleChange} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2" />
            </label>
          )}
        </div>

        {formError && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p>}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save event'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MembersPage() {
  const { members, addMember, removeMember, accountHolders, linkMemberToAccount } = useApp();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [linkingId, setLinkingId] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Please enter a name for the family member.');
      return;
    }

    setAdding(true);
    const { error } = await addMember(trimmed, color);
    setAdding(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success(`${trimmed} was added to your family.`);
    setName('');
  };

  const handleRemove = async (member) => {
    if (!window.confirm(`Remove ${member.name} from your family?`)) return;
    setRemovingId(member.id);
    const { error } = await removeMember(member.id);
    setRemovingId(null);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`${member.name} was removed.`);
    }
  };

  const handleLinkChange = async (memberId, accountUserId) => {
    setLinkingId(memberId);
    const { error } = await linkMemberToAccount(memberId, accountUserId);
    setLinkingId(null);
    if (error) toast.error(error);
  };

  const accountLabel = (userId) => {
    const holder = accountHolders.find((holder) => holder.user_id === userId);
    return holder?.display_name || 'Unknown account';
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Family members</p>
            <h2 className="text-xl font-semibold">Manage your family roster</h2>
          </div>
        </div>
        {members.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No family members yet. Add your first one using the form.
          </div>
        ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: member.color }} />
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-slate-500">{member.role}</p>
                  </div>
                </div>
                <button onClick={() => handleRemove(member)} disabled={removingId === member.id} className="text-sm font-semibold text-red-600 disabled:opacity-50">
                  {removingId === member.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
              {hasSupabaseConfig && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-medium text-slate-500">
                    Linked account (for notifications)
                    <select
                      value={member.user_id || ''}
                      onChange={(event) => handleLinkChange(member.id, event.target.value || null)}
                      disabled={linkingId === member.id}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-1.5 text-sm disabled:opacity-50"
                    >
                      <option value="">Not linked</option>
                      {accountHolders.map((holder) => (
                        <option key={holder.user_id} value={holder.user_id}>
                          {holder.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {member.user_id && (
                    <p className="mt-1 text-xs text-teal-700">Linked to {accountLabel(member.user_id)}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Add a member</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Color
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200" />
          </label>
          <button type="submit" disabled={adding} className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {adding ? 'Adding…' : 'Add member'}
          </button>
        </form>
      </div>
    </div>
  );
}

function SettingsPage() {
  const { family, user, leaveFamily } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleCopy = async () => {
    if (!family?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the invite code. Please copy it manually.');
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this family calendar? You can rejoin later with the invite code.')) return;
    setLeaving(true);
    const { error } = await leaveFamily();
    setLeaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    navigate('/onboarding');
  };

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Settings</p>
      <h2 className="mt-2 text-2xl font-semibold">Family and account preferences</h2>
      <div className="mt-6 space-y-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
        <div className="flex items-center justify-between">
          <span>Family</span>
          <span className="font-semibold text-slate-900">{family?.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Your role</span>
          <span className="font-semibold capitalize text-slate-900">{family?.role || 'member'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Signed in as</span>
          <span className="font-semibold text-slate-900">{user?.displayName || 'Guest'}</span>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-4">
        <p className="text-sm font-semibold text-teal-900">Invite family members</p>
        <p className="mt-1 text-sm text-teal-700">Share this code so others can join your family calendar.</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex-1 rounded-2xl border border-teal-300 bg-white px-4 py-2 text-center text-lg font-bold tracking-[0.3em] text-teal-700">
            {family?.inviteCode}
          </span>
          <button onClick={handleCopy} className="rounded-2xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-900">Leave family</p>
        <p className="mt-1 text-sm text-red-700">You'll lose access to this family's calendar until you rejoin with the invite code.</p>
        <button onClick={handleLeave} disabled={leaving} className="mt-3 rounded-2xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
          {leaving ? 'Leaving…' : 'Leave this family'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { passwordRecovery } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  // Supabase fires this the moment the recovery link's tokens are consumed.
  // Force the user to /reset-password regardless of where they landed —
  // needed because an unconfigured Redirect URL allowlist makes Supabase
  // fall back to the Site URL (usually "/"), dropping our intended path.
  useEffect(() => {
    if (passwordRecovery && location.pathname !== '/reset-password') {
      navigate('/reset-password', { replace: true });
    }
  }, [passwordRecovery, location.pathname, navigate]);

  return (
    <ErrorBoundary>
      <AppShell>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>} />
          <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/week/:dateKey" element={<ProtectedRoute><WeekPage /></ProtectedRoute>} />
          <Route path="/day/:dateKey" element={<ProtectedRoute><DayPage /></ProtectedRoute>} />
          <Route path="/event/new" element={<ProtectedRoute><EventFormPage /></ProtectedRoute>} />
          <Route path="/event/:eventId/edit" element={<ProtectedRoute><EventFormPage /></ProtectedRoute>} />
          <Route path="/members" element={<ProtectedRoute><MembersPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        </Routes>
      </AppShell>
    </ErrorBoundary>
  );
}
