import { useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { formatDateLabel, formatMonthLabel } from './data/sampleData';

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ProtectedRoute({ children }) {
  const { user } = useApp();
  return user ? children : <Navigate to="/login" replace />;
}

function AppShell({ children }) {
  const { user, family, logout } = useApp();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-600">Family Calendar</p>
            <h1 className="text-xl font-semibold">{family.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 sm:inline">{user.displayName}</span>
                <button onClick={handleLogout} className="rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700">
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="rounded-full bg-teal-600 px-3 py-1 text-sm font-medium text-white">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
          {[
            ['/', 'Calendar'],
            ['/day/today', 'Today'],
            ['/members', 'Members'],
            ['/settings', 'Settings']
          ].map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-medium ${isActive ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}

function LoginPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    login(email.trim(), displayName.trim() || undefined);
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">Welcome</p>
      <h2 className="mt-2 text-2xl font-semibold">Sign in to your family calendar</h2>
      <p className="mt-2 text-sm text-slate-600">This demo uses a local session so you can explore the experience right away.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="you@example.com" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Display name (optional)
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="Mom" />
        </label>
        <button type="submit" className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white">
          Continue
        </button>
      </form>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Need to join a family?</p>
        <Link to="/join" className="mt-2 inline-flex font-semibold text-teal-600">
          Enter your invite code →
        </Link>
      </div>
    </div>
  );
}

function JoinPage() {
  const { joinFamily } = useApp();
  const [inviteCode, setInviteCode] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    joinFamily(inviteCode);
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-600">Join family</p>
      <h2 className="mt-2 text-2xl font-semibold">Enter your invite code</h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Invite code
          <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none ring-0" placeholder="SMITH123" />
        </label>
        <button type="submit" className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white">
          Join family
        </button>
      </form>
    </div>
  );
}

function HomePage() {
  const { events, currentMonth, setCurrentMonth } = useApp();

  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const monthDays = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = (monthStart.getDay() + 6) % 7;
  const cells = [];

  for (let index = 0; index < firstDay; index += 1) cells.push(null);
  for (let day = 1; day <= monthDays; day += 1) cells.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);

  const dayEvents = useMemo(() => {
    return (dateKey) => events.filter((event) => event.date === dateKey);
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium">
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Month view</p>
          <h2 className="text-xl font-semibold">{formatMonthLabel(currentMonth)}</h2>
        </div>
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium">
          Next →
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="h-24 rounded-2xl border border-transparent bg-slate-50" />;
            }

            const dateKey = formatDateKey(date);
            const isToday = dateKey === formatDateKey(new Date());
            const matchingEvents = dayEvents(dateKey);

            return (
              <Link key={dateKey} to={`/day/${dateKey}`} className={`flex h-24 flex-col rounded-2xl border p-2 text-left ${isToday ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                <span className={`text-sm font-semibold ${isToday ? 'text-teal-700' : 'text-slate-700'}`}>{date.getDate()}</span>
                <div className="mt-2 space-y-1 overflow-hidden text-[11px] text-slate-600">
                  {matchingEvents.slice(0, 2).map((event) => (
                    <div key={event.id} className="truncate rounded bg-slate-100 px-2 py-1">
                      {event.title}
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayPage() {
  const { dateKey } = useParams();
  const { events, members } = useApp();
  const resolvedDateKey = dateKey === 'today' ? formatDateKey(new Date()) : dateKey;
  const dayEvents = events.filter((event) => event.date === resolvedDateKey);
  const dateLabel = formatDateLabel(resolvedDateKey);

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
        {dayEvents.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No events yet for this day. Tap add event to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {dayEvents.map((event) => {
              const assignedMembers = members.filter((member) => event.assignedMemberIds.includes(member.id));
              return (
                <div key={event.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{event.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{event.allDay ? 'All day' : `${event.startTime || '--'} – ${event.endTime || '--'}`}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/event/${event.id}/edit`} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium">Edit</Link>
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingEvent = events.find((event) => event.id === eventId);
  const initialDate = searchParams.get('date') || existingEvent?.date || '';

  const [form, setForm] = useState({
    title: existingEvent?.title || '',
    date: initialDate,
    startTime: existingEvent?.startTime || '09:00',
    endTime: existingEvent?.endTime || '10:00',
    allDay: existingEvent?.allDay || false,
    location: existingEvent?.location || '',
    notes: existingEvent?.notes || '',
    assignedMemberIds: existingEvent?.assignedMemberIds || []
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

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.date) return;

    const payload = {
      title: form.title.trim(),
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      allDay: form.allDay,
      location: form.location.trim(),
      notes: form.notes.trim(),
      assignedMemberIds: form.assignedMemberIds
    };

    if (existingEvent) {
      updateEvent(existingEvent.id, payload);
    } else {
      addEvent(payload);
    }

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

        <div className="flex items-center justify-between gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">
            Cancel
          </button>
          <button type="submit" className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
            Save event
          </button>
        </div>
      </form>
    </div>
  );
}

function MembersPage() {
  const { members, addMember, removeMember } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    addMember(name.trim(), color);
    setName('');
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
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: member.color }} />
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-slate-500">{member.role}</p>
                </div>
              </div>
              <button onClick={() => removeMember(member.id)} className="text-sm font-semibold text-red-600">
                Remove
              </button>
            </div>
          ))}
        </div>
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
          <button type="submit" className="w-full rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white">
            Add member
          </button>
        </form>
      </div>
    </div>
  );
}

function SettingsPage() {
  const { family, user } = useApp();
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Settings</p>
      <h2 className="mt-2 text-2xl font-semibold">Family and account preferences</h2>
      <div className="mt-6 space-y-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
        <div className="flex items-center justify-between">
          <span>Family</span>
          <span className="font-semibold text-slate-900">{family.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Invite code</span>
          <span className="font-semibold text-slate-900">{family.inviteCode}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Signed in as</span>
          <span className="font-semibold text-slate-900">{user?.displayName || 'Guest'}</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/day/:dateKey" element={<ProtectedRoute><DayPage /></ProtectedRoute>} />
        <Route path="/event/new" element={<ProtectedRoute><EventFormPage /></ProtectedRoute>} />
        <Route path="/event/:eventId/edit" element={<ProtectedRoute><EventFormPage /></ProtectedRoute>} />
        <Route path="/members" element={<ProtectedRoute><MembersPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      </Routes>
    </AppShell>
  );
}
