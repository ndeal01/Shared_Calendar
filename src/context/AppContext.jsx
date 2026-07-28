import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sampleEvents, sampleFamily, sampleMembers } from '../data/sampleData';
import { hasSupabaseConfig, supabase } from '../supabaseClient';
import { useToast } from './ToastContext';
import { getEventOccurrences } from '../utils/recurrence';

const AppContext = createContext({});

const STORAGE_KEYS = {
  user: 'family-calendar:user',
  family: 'family-calendar:family',
  members: 'family-calendar:members',
  events: 'family-calendar:events',
  currentMonth: 'family-calendar:currentMonth'
};

function createDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function readFromStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue === null ? fallback : JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function readDateFromStorage(key, fallback) {
  const storedValue = readFromStorage(key, null);
  if (!storedValue) return fallback;

  const parsedDate = new Date(storedValue);
  return Number.isNaN(parsedDate.getTime()) ? fallback : parsedDate;
}

function writeToStorage(key, value) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures for demo/local usage.
  }
}

function clearStorage(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }
}

function normalizeEventRow(eventRow, assignments) {
  return {
    id: eventRow.id,
    title: eventRow.title,
    date: eventRow.date,
    startTime: eventRow.start_time || '',
    endTime: eventRow.end_time || '',
    allDay: eventRow.all_day || false,
    location: eventRow.location || '',
    notes: eventRow.notes || '',
    isTask: eventRow.is_task || false,
    recurrenceFreq: eventRow.recurrence_freq || 'none',
    recurrenceInterval: eventRow.recurrence_interval || 1,
    recurrenceDaysOfWeek: eventRow.recurrence_days_of_week || null,
    recurrenceEndDate: eventRow.recurrence_end_date || null,
    reminderMinutesBefore: eventRow.reminder_minutes_before ?? null,
    assignedMemberIds: assignments.filter((a) => a.event_id === eventRow.id).map((a) => a.member_id)
  };
}

export function AppProvider({ children }) {
  const toast = useToast();

  // Local/demo auth (used only when Supabase is not configured).
  const [localUser, setLocalUser] = useState(() => readFromStorage(STORAGE_KEYS.user, null));

  // Real Supabase auth session.
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);

  const [family, setFamily] = useState(() => (hasSupabaseConfig ? null : readFromStorage(STORAGE_KEYS.family, sampleFamily)));
  const [members, setMembers] = useState(() => (hasSupabaseConfig ? [] : readFromStorage(STORAGE_KEYS.members, sampleMembers)));
  const [events, setEvents] = useState(() => (hasSupabaseConfig ? [] : readFromStorage(STORAGE_KEYS.events, sampleEvents)));
  const [completions, setCompletions] = useState([]);
  const [accountHolders, setAccountHolders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(() => readDateFromStorage(STORAGE_KEYS.currentMonth, new Date()));
  const [familyReady, setFamilyReady] = useState(!hasSupabaseConfig);
  const [authError, setAuthError] = useState('');
  // Set when Supabase fires a PASSWORD_RECOVERY auth event (the user just
  // clicked a password-reset email link). We use this instead of relying on
  // the URL path, because if "/reset-password" isn't in Supabase's Redirect
  // URLs allowlist, it silently falls back to the Site URL (usually "/") and
  // drops the path — but the recovery session/event still fires either way.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // Subscribe to Supabase auth state.
  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return undefined;

    let ignore = false;

    supabase.auth.getSession().then(({ data }) => {
      if (ignore) return;
      setSession(data?.session ?? null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      ignore = true;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const user = useMemo(() => {
    if (!hasSupabaseConfig) return localUser;
    if (!session?.user) return null;

    return {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'You'
    };
  }, [session, localUser]);

  // Load the signed-in user's family (and its members/events) from Supabase.
  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return undefined;

    let ignore = false;

    async function loadFamilyForUser() {
      if (!user?.id) {
        if (!ignore) {
          setFamily(null);
          setMembers([]);
          setEvents([]);
          setCompletions([]);
          setAccountHolders([]);
          setFamilyReady(true);
        }
        return;
      }

      setFamilyReady(false);

      try {
        const { data: membership, error: membershipError } = await supabase
          .from('family_users')
          .select('family_id, role, families ( id, name, invite_code )')
          .eq('user_id', user.id)
          .maybeSingle();

        if (membershipError) {
          console.warn('Unable to load family membership', membershipError);
        }

        if (!membership?.families) {
          if (!ignore) {
            setFamily(null);
            setMembers([]);
            setEvents([]);
            setCompletions([]);
            setAccountHolders([]);
            setFamilyReady(true);
          }
          return;
        }

        const familyRow = membership.families;

        const [{ data: membersData }, { data: eventsData }, { data: accountHoldersData }] = await Promise.all([
          supabase.from('members').select('*').eq('family_id', familyRow.id).order('created_at', { ascending: true }),
          supabase.from('events').select('*').eq('family_id', familyRow.id).order('date', { ascending: true }),
          supabase.from('family_users').select('user_id, display_name, role').eq('family_id', familyRow.id)
        ]);

        const eventIds = (eventsData || []).map((e) => e.id);
        let assignments = [];
        let completionsData = [];
        if (eventIds.length) {
          const [{ data: assignData }, { data: completionRows }] = await Promise.all([
            supabase.from('event_assignments').select('*').in('event_id', eventIds),
            supabase.from('event_completions').select('*').in('event_id', eventIds)
          ]);
          assignments = assignData || [];
          completionsData = completionRows || [];
        }

        if (!ignore) {
          setFamily({ id: familyRow.id, name: familyRow.name, inviteCode: familyRow.invite_code, role: membership.role });
          setMembers(membersData || []);
          setEvents((eventsData || []).map((eventRow) => normalizeEventRow(eventRow, assignments)));
          setCompletions(completionsData);
          setAccountHolders(accountHoldersData || []);
          setFamilyReady(true);
        }
      } catch (e) {
        console.warn('Unable to load family for user', e);
        if (!ignore) setFamilyReady(true);
      }
    }

    loadFamilyForUser();

    return () => {
      ignore = true;
    };
  }, [user?.id]);

  // Load and subscribe to the signed-in user's own notifications.
  useEffect(() => {
    if (!hasSupabaseConfig || !supabase || !user?.id) {
      setNotifications([]);
      return undefined;
    }

    let ignore = false;

    async function loadNotifications() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!ignore && !error) setNotifications(data || []);
    }

    loadNotifications();

    // Live-update the notification bell when a new notification arrives for
    // this user (e.g. another family member just completed an assigned task).
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setNotifications((current) => [payload.new, ...current]);
        } else if (payload.eventType === 'UPDATE') {
          setNotifications((current) => current.map((item) => (item.id === payload.new.id ? payload.new : item)));
        } else if (payload.eventType === 'DELETE') {
          setNotifications((current) => current.filter((item) => item.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // --- Reminder notifications ---
  // Polls every 60s for upcoming occurrences the current user should be
  // reminded about (no push/cron server, so this only fires while a tab is
  // open). Dedupes locally per-session and relies on a partial unique index
  // on notifications(user_id, event_id, occurrence_date) where type='reminder'
  // server-side so re-checks/reloads never create duplicate rows.
  const remindedKeysRef = useRef(new Set());

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase || !user?.id || !family?.id) return undefined;

    const checkReminders = async () => {
      const now = new Date();
      const todayKey = createDateKey(now);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowKey = createDateKey(tomorrow);

      for (const eventItem of events) {
        if (eventItem.reminderMinutesBefore == null || eventItem.allDay || !eventItem.startTime) continue;

        // Notify if the signed-in user is one of the assigned members, or the
        // event has no specific assignments (family-wide).
        const assignedMemberIds = eventItem.assignedMemberIds || [];
        const isAssignedToMe = assignedMemberIds.some((memberId) => {
          const member = members.find((m) => m.id === memberId);
          return member?.user_id === user.id;
        });
        if (assignedMemberIds.length > 0 && !isAssignedToMe) continue;

        const occurrenceDates = getEventOccurrences(eventItem, todayKey, tomorrowKey);

        for (const occurrenceDateKey of occurrenceDates) {
          const startAt = new Date(`${occurrenceDateKey}T${eventItem.startTime}:00`);
          const reminderAt = new Date(startAt.getTime() - eventItem.reminderMinutesBefore * 60 * 1000);

          if (now < reminderAt || now >= startAt) continue;

          const dedupeKey = `${eventItem.id}|${occurrenceDateKey}`;
          if (remindedKeysRef.current.has(dedupeKey)) continue;
          remindedKeysRef.current.add(dedupeKey);

          const message =
            eventItem.reminderMinutesBefore === 0
              ? `"${eventItem.title}" is starting now`
              : `"${eventItem.title}" starts in ${eventItem.reminderMinutesBefore} minutes`;

          const { error: upsertError } = await supabase
            .from('notifications')
            .upsert(
              [{
                family_id: family.id,
                user_id: user.id,
                event_id: eventItem.id,
                occurrence_date: occurrenceDateKey,
                message,
                type: 'reminder'
              }],
              { onConflict: 'user_id,event_id,occurrence_date', ignoreDuplicates: true }
            );

          if (!upsertError) toast(message);
        }
      }
    };

    checkReminders();
    const intervalId = setInterval(checkReminders, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [user?.id, family?.id, events, members, toast]);

  useEffect(() => {
    if (hasSupabaseConfig) return;
    writeToStorage(STORAGE_KEYS.user, localUser);
  }, [localUser]);

  useEffect(() => {
    if (hasSupabaseConfig) return;
    writeToStorage(STORAGE_KEYS.family, family);
  }, [family]);

  useEffect(() => {
    if (hasSupabaseConfig) return;
    writeToStorage(STORAGE_KEYS.members, members);
  }, [members]);

  useEffect(() => {
    if (hasSupabaseConfig) return;
    writeToStorage(STORAGE_KEYS.events, events);
  }, [events]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.currentMonth, currentMonth.toISOString());
  }, [currentMonth]);

  // --- Auth actions ---

  const login = (email, displayName) => {
    // Demo/local fallback login when Supabase isn't configured.
    setLocalUser({ email, displayName: displayName || email.split('@')[0] });
  };

  const signUp = async (email, password, displayName) => {
    if (!hasSupabaseConfig || !supabase) {
      login(email, displayName);
      return { error: null };
    }

    setAuthError('');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
        // Send confirmation links back to wherever the app is actually running
        // (localhost:5173, your LAN IP, or production) instead of Supabase's
        // default placeholder Site URL.
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
      }
    });

    if (error) {
      setAuthError(error.message);
      return { error };
    }

    if (data?.session) setSession(data.session);
    return { error: null, needsEmailConfirmation: !data?.session };
  };

  const signIn = async (email, password) => {
    if (!hasSupabaseConfig || !supabase) {
      login(email);
      return { error: null };
    }

    setAuthError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthError(error.message);
      return { error };
    }

    setSession(data.session);
    return { error: null };
  };

  // Send a password-reset email; the link redirects back to /reset-password
  // where updatePassword() below sets the new password.
  const requestPasswordReset = async (email) => {
    if (!hasSupabaseConfig || !supabase) return { error: new Error('Password reset requires Supabase') };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined
    });

    return { error: error || null };
  };

  const updatePassword = async (newPassword) => {
    if (!hasSupabaseConfig || !supabase) return { error: new Error('Password update requires Supabase') };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setPasswordRecovery(false);
    return { error: error || null };
  };

  const clearPasswordRecovery = () => setPasswordRecovery(false);

  const logout = async () => {
    if (hasSupabaseConfig && supabase) {
      await supabase.auth.signOut();
      setSession(null);
      setFamily(null);
      setMembers([]);
      setEvents([]);
      return;
    }

    setLocalUser(null);
    clearStorage(STORAGE_KEYS.user);
  };

  // --- Family actions ---

  const createFamily = async (name) => {
    const trimmedName = name?.trim();
    if (!trimmedName) return { error: new Error('Family name is required') };

    if (hasSupabaseConfig && supabase && user?.id) {
      try {
        const id = `family-${Date.now()}`;
        const inviteCode = generateInviteCode();

        const { data: familyRow, error: familyError } = await supabase
          .from('families')
          .insert([{ id, name: trimmedName, invite_code: inviteCode, owner_id: user.id }])
          .select()
          .single();

        if (familyError) return { error: familyError };

        const { error: membershipError } = await supabase.from('family_users').insert([{
          family_id: familyRow.id,
          user_id: user.id,
          role: 'owner',
          display_name: user.displayName
        }]);

        if (membershipError) return { error: membershipError };

        setFamily({ id: familyRow.id, name: familyRow.name, inviteCode: familyRow.invite_code, role: 'owner' });
        setMembers([]);
        setEvents([]);
        return { error: null };
      } catch (e) {
        return { error: e };
      }
    }

    // Local fallback.
    setFamily({ id: `family-${Date.now()}`, name: trimmedName, inviteCode: generateInviteCode() });
    return { error: null };
  };

  const joinFamily = async (inviteCode) => {
    const normalized = inviteCode?.trim().toUpperCase();
    if (!normalized) return { error: new Error('Invite code is required') };

    if (hasSupabaseConfig && supabase && user?.id) {
      try {
        // families is RLS-restricted to members only, so we look the row up
        // via a narrow SECURITY DEFINER function that matches on invite_code.
        const { data: matches, error: familyError } = await supabase
          .rpc('get_family_by_invite_code', { code: normalized });

        if (familyError) return { error: familyError };
        const familyRow = matches?.[0];
        if (!familyRow) return { error: new Error('No family found with that invite code') };

        const { error: membershipError } = await supabase.from('family_users').insert([{
          family_id: familyRow.id,
          user_id: user.id,
          role: 'member',
          display_name: user.displayName
        }]);

        if (membershipError) {
          if (membershipError.code === '23505') {
            return { error: new Error('You already belong to this family') };
          }
          return { error: membershipError };
        }

        const [{ data: membersData }, { data: eventsData }] = await Promise.all([
          supabase.from('members').select('*').eq('family_id', familyRow.id).order('created_at', { ascending: true }),
          supabase.from('events').select('*').eq('family_id', familyRow.id).order('date', { ascending: true })
        ]);

        const eventIds = (eventsData || []).map((e) => e.id);
        let assignments = [];
        if (eventIds.length) {
          const { data: assignData } = await supabase.from('event_assignments').select('*').in('event_id', eventIds);
          assignments = assignData || [];
        }

        setFamily({ id: familyRow.id, name: familyRow.name, inviteCode: familyRow.invite_code, role: 'member' });
        setMembers(membersData || []);
        setEvents((eventsData || []).map((eventRow) => normalizeEventRow(eventRow, assignments)));
        return { error: null };
      } catch (e) {
        return { error: e };
      }
    }

    // Local fallback: just remember the code, no real family to join.
    setFamily((current) => ({ ...(current || sampleFamily), inviteCode: normalized }));
    return { error: null };
  };

  const leaveFamily = async () => {
    if (hasSupabaseConfig && supabase && user?.id && family?.id) {
      try {
        const { error } = await supabase.from('family_users').delete().eq('family_id', family.id).eq('user_id', user.id);
        if (error) return { error };
      } catch (e) {
        return { error: e };
      }
    }

    setFamily(null);
    setMembers([]);
    setEvents([]);
    return { error: null };
  };

  // --- Event actions ---

  const addEvent = async (eventInput) => {
    const newEvent = {
      id: `event-${Date.now()}`,
      isTask: false,
      recurrenceFreq: 'none',
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: null,
      recurrenceEndDate: null,
      reminderMinutesBefore: 30,
      ...eventInput,
      assignedMemberIds: eventInput.assignedMemberIds || []
    };

    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        const { error: insertError } = await supabase.from('events').insert([{
          id: newEvent.id,
          family_id: family.id,
          title: newEvent.title,
          date: newEvent.date,
          start_time: newEvent.startTime || null,
          end_time: newEvent.endTime || null,
          all_day: newEvent.allDay || false,
          location: newEvent.location || null,
          notes: newEvent.notes || null,
          is_task: newEvent.isTask || false,
          recurrence_freq: newEvent.recurrenceFreq || 'none',
          recurrence_interval: newEvent.recurrenceInterval || 1,
          recurrence_days_of_week: newEvent.recurrenceFreq === 'weekly' ? newEvent.recurrenceDaysOfWeek : null,
          recurrence_end_date: newEvent.recurrenceEndDate || null,
          reminder_minutes_before: newEvent.reminderMinutesBefore ?? null
        }]);

        if (insertError) return { error: insertError };

        if (newEvent.assignedMemberIds.length > 0) {
          const rows = newEvent.assignedMemberIds.map((memberId) => ({ event_id: newEvent.id, member_id: memberId }));
          const { error: assignError } = await supabase.from('event_assignments').insert(rows);
          if (assignError) return { error: assignError };
        }

        setEvents((current) => [newEvent, ...current]);
        return { event: newEvent, error: null };
      } catch (e) {
        return { error: e };
      }
    }

    setEvents((current) => [newEvent, ...current]);
    return { event: newEvent, error: null };
  };

  const updateEvent = async (eventId, updates) => {
    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        const { error: updateError } = await supabase.from('events').update({
          title: updates.title,
          date: updates.date,
          start_time: updates.startTime || null,
          end_time: updates.endTime || null,
          all_day: updates.allDay || false,
          location: updates.location || null,
          notes: updates.notes || null,
          is_task: updates.isTask || false,
          recurrence_freq: updates.recurrenceFreq || 'none',
          recurrence_interval: updates.recurrenceInterval || 1,
          recurrence_days_of_week: updates.recurrenceFreq === 'weekly' ? updates.recurrenceDaysOfWeek : null,
          recurrence_end_date: updates.recurrenceEndDate || null,
          reminder_minutes_before: updates.reminderMinutesBefore ?? null
        }).eq('id', eventId);

        if (updateError) return { error: updateError };

        if (Array.isArray(updates.assignedMemberIds)) {
          // Replace assignments: delete existing, insert new
          await supabase.from('event_assignments').delete().eq('event_id', eventId);
          const rows = updates.assignedMemberIds.map((memberId) => ({ event_id: eventId, member_id: memberId }));
          if (rows.length) {
            const { error: assignError } = await supabase.from('event_assignments').insert(rows);
            if (assignError) return { error: assignError };
          }
        }
      } catch (e) {
        return { error: e };
      }
    }

    setEvents((current) => current.map((event) => (event.id === eventId ? { ...event, ...updates } : event)));
    return { error: null };
  };

  const deleteEvent = async (eventId) => {
    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        await supabase.from('event_assignments').delete().eq('event_id', eventId);
        const { error } = await supabase.from('events').delete().eq('id', eventId);
        if (error) return { error };
      } catch (e) {
        return { error: e };
      }
    }

    setEvents((current) => current.filter((event) => event.id !== eventId));
    return { error: null };
  };

  const addMember = async (name, color, role = 'member') => {
    const member = {
      id: `member-${Date.now()}`,
      name,
      color,
      role
    };

    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        const { data, error } = await supabase.from('members').insert([{
          id: member.id,
          family_id: family.id,
          name: member.name,
          color: member.color,
          role: member.role
        }]).select().single();

        if (error) return { error };

        setMembers((current) => [...current, data]);
        return { member: data, error: null };
      } catch (e) {
        return { error: e };
      }
    }

    setMembers((current) => [...current, member]);
    return { member, error: null };
  };

  const removeMember = async (memberId) => {
    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        await supabase.from('event_assignments').delete().eq('member_id', memberId);
        const { error } = await supabase.from('members').delete().eq('id', memberId);
        if (error) return { error };
      } catch (e) {
        return { error: e };
      }
    }

    setMembers((current) => current.filter((member) => member.id !== memberId));
    setEvents((current) => current.map((event) => ({ ...event, assignedMemberIds: event.assignedMemberIds.filter((id) => id !== memberId) })));
    return { error: null };
  };

  // Link a member profile to one of the real account holders already in this
  // family (from family_users), so they can receive in-app notifications.
  const linkMemberToAccount = async (memberId, accountUserId) => {
    if (!hasSupabaseConfig || !supabase) return { error: new Error('Account linking requires Supabase') };

    try {
      const { data, error } = await supabase.from('members').update({ user_id: accountUserId || null }).eq('id', memberId).select().single();
      if (error) return { error };
      setMembers((current) => current.map((member) => (member.id === memberId ? data : member)));
      return { error: null };
    } catch (e) {
      return { error: e };
    }
  };

  // --- Task completion + notifications ---

  const isOccurrenceComplete = (eventId, occurrenceDateKey) =>
    completions.some((c) => c.event_id === eventId && c.occurrence_date === occurrenceDateKey);

  const toggleTaskCompletion = async (eventId, occurrenceDateKey) => {
    const alreadyComplete = isOccurrenceComplete(eventId, occurrenceDateKey);

    if (alreadyComplete) {
      if (hasSupabaseConfig && supabase) {
        try {
          const { error } = await supabase.from('event_completions').delete().eq('event_id', eventId).eq('occurrence_date', occurrenceDateKey);
          if (error) return { error };
        } catch (e) {
          return { error: e };
        }
      }
      setCompletions((current) => current.filter((c) => !(c.event_id === eventId && c.occurrence_date === occurrenceDateKey)));
      return { error: null };
    }

    const newCompletion = { event_id: eventId, occurrence_date: occurrenceDateKey, completed_by: user?.id || null, completed_at: new Date().toISOString() };

    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        const { error: insertError } = await supabase.from('event_completions').insert([newCompletion]);
        if (insertError) return { error: insertError };

        setCompletions((current) => [...current, newCompletion]);

        // Notify every assigned member who has a linked account (other than
        // whoever just completed the task).
        const completedEvent = events.find((e) => e.id === eventId);
        const assignedMemberIds = completedEvent?.assignedMemberIds || [];
        const recipientUserIds = members
          .filter((m) => assignedMemberIds.includes(m.id) && m.user_id && m.user_id !== user?.id)
          .map((m) => m.user_id);

        if (recipientUserIds.length > 0 && completedEvent) {
          const message = `${user?.displayName || 'Someone'} completed "${completedEvent.title}"`;
          const notificationRows = recipientUserIds.map((recipientId) => ({
            family_id: family.id,
            user_id: recipientId,
            event_id: eventId,
            occurrence_date: occurrenceDateKey,
            message
          }));
          await supabase.from('notifications').insert(notificationRows);
        }

        return { error: null };
      } catch (e) {
        return { error: e };
      }
    }

    setCompletions((current) => [...current, newCompletion]);
    return { error: null };
  };

  const markNotificationRead = async (notificationId) => {
    setNotifications((current) => current.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));
    if (hasSupabaseConfig && supabase) {
      try {
        const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
        if (error) return { error };
      } catch (e) {
        return { error: e };
      }
    }
    return { error: null };
  };

  const markAllNotificationsRead = async () => {
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    if (hasSupabaseConfig && supabase && user?.id) {
      try {
        const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
        if (error) return { error };
      } catch (e) {
        return { error: e };
      }
    }
    return { error: null };
  };

  const value = useMemo(
    () => ({
      user,
      authReady,
      authError,
      family,
      familyReady,
      members,
      events,
      completions,
      accountHolders,
      notifications,
      currentMonth,
      setCurrentMonth,
      signUp,
      signIn,
      login,
      logout,
      requestPasswordReset,
      updatePassword,
      passwordRecovery,
      clearPasswordRecovery,
      createFamily,
      joinFamily,
      leaveFamily,
      addEvent,
      updateEvent,
      deleteEvent,
      addMember,
      removeMember,
      linkMemberToAccount,
      isOccurrenceComplete,
      toggleTaskCompletion,
      markNotificationRead,
      markAllNotificationsRead,
      createDateKey
    }),
    [user, authReady, authError, family, familyReady, members, events, completions, accountHolders, notifications, currentMonth, passwordRecovery]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}

export default AppContext;
