import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { sampleEvents, sampleFamily, sampleMembers } from '../data/sampleData';
import { hasSupabaseConfig, supabase } from '../supabaseClient';

const AppContext = createContext({});

const STORAGE_KEYS = {
  user: 'family-calendar:user',
  family: 'family-calendar:family',
  members: 'family-calendar:members',
  events: 'family-calendar:events',
  currentMonth: 'family-calendar:currentMonth'
};

const SUPABASE_RECORD_ID = 'shared-family-calendar';

function createDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
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

async function readRemoteState() {
  if (!hasSupabaseConfig || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('family_calendar_state')
      .select('payload')
      .eq('id', SUPABASE_RECORD_ID)
      .maybeSingle();

    if (error) {
      console.warn('Unable to load Supabase state', error);
      return null;
    }

    return data?.payload ?? null;
  } catch (error) {
    console.warn('Unable to load Supabase state', error);
    return null;
  }
}

async function writeRemoteState(payload) {
  if (!hasSupabaseConfig || !supabase) return;

  try {
    const { error } = await supabase.from('family_calendar_state').upsert({
      id: SUPABASE_RECORD_ID,
      payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    if (error) {
      console.warn('Unable to save Supabase state', error);
    }
  } catch (error) {
    console.warn('Unable to save Supabase state', error);
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => readFromStorage(STORAGE_KEYS.user, null));
  const [family, setFamily] = useState(() => readFromStorage(STORAGE_KEYS.family, sampleFamily));
  const [members, setMembers] = useState(() => readFromStorage(STORAGE_KEYS.members, sampleMembers));
  const [events, setEvents] = useState(() => readFromStorage(STORAGE_KEYS.events, sampleEvents));
  const [currentMonth, setCurrentMonth] = useState(() => readDateFromStorage(STORAGE_KEYS.currentMonth, new Date()));
  const [remoteReady, setRemoteReady] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function hydrateFromRemote() {
      if (!hasSupabaseConfig || !supabase) {
        setRemoteReady(true);
        return;
      }

      try {
        // Try to resolve a family to load. Prefer stored inviteCode if available.
        let familyRow = null;
        if (family?.inviteCode) {
          const { data, error } = await supabase.from('families').select('*').eq('invite_code', family.inviteCode).maybeSingle();
          if (!error && data) familyRow = data;
        }

        if (!familyRow) {
          const { data: familiesList, error: famErr } = await supabase.from('families').select('*').order('created_at', { ascending: true }).limit(1);
          if (!famErr && familiesList && familiesList.length > 0) familyRow = familiesList[0];
        }

        if (!familyRow) {
          // No remote family — nothing to hydrate
          setRemoteReady(true);
          return;
        }

        // load members
        const { data: membersData } = await supabase.from('members').select('*').eq('family_id', familyRow.id).order('created_at', { ascending: true });

        // load events
        const { data: eventsData } = await supabase.from('events').select('*').eq('family_id', familyRow.id).order('date', { ascending: true });

        // load assignments
        const eventIds = (eventsData || []).map((e) => e.id);
        let assignments = [];
        if (eventIds.length) {
          const { data: assignData } = await supabase.from('event_assignments').select('*').in('event_id', eventIds);
          assignments = assignData || [];
        }

        const normalizedEvents = (eventsData || []).map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          startTime: e.start_time || '',
          endTime: e.end_time || '',
          allDay: e.all_day || false,
          location: e.location || '',
          notes: e.notes || '',
          assignedMemberIds: (assignments.filter((a) => a.event_id === e.id).map((a) => a.member_id)) || []
        }));

        setFamily({ id: familyRow.id, name: familyRow.name, inviteCode: familyRow.invite_code });
        setMembers(membersData || []);
        setEvents(normalizedEvents || []);
        setCurrentMonth(new Date());
      } catch (e) {
        console.warn('Supabase hydrate failed', e);
      }

      setRemoteReady(true);
    }

    hydrateFromRemote();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.user, user);
  }, [user]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.family, family);
  }, [family]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.members, members);
  }, [members]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.events, events);
  }, [events]);

  useEffect(() => {
    writeToStorage(STORAGE_KEYS.currentMonth, currentMonth.toISOString());
  }, [currentMonth]);

  useEffect(() => {
    if (!remoteReady) return;

    void writeRemoteState({
      user,
      family,
      members,
      events,
      currentMonth: currentMonth.toISOString()
    });
  }, [remoteReady, user, family, members, events, currentMonth]);

  const login = (email, displayName) => {
    setUser({ email, displayName: displayName || email.split('@')[0] });
  };

  const logout = () => {
    setUser(null);
  };

  const joinFamily = async (inviteCode) => {
    if (!inviteCode?.trim()) return;
    const normalized = inviteCode.trim();

    if (hasSupabaseConfig && supabase) {
      // Create family row and use its id
      try {
        const id = `family-${Date.now()}`;
        const { data, error } = await supabase.from('families').insert([{ id, name: '', invite_code: normalized }]).select().single();
        if (!error && data) {
          setFamily({ id: data.id, name: data.name, inviteCode: data.invite_code });
          setMembers([]);
          setEvents([]);
          return;
        }
      } catch (e) {
        console.warn('Supabase joinFamily failed', e);
      }
    }

    setFamily((current) => ({ ...current, inviteCode: normalized }));
  };

  const addEvent = async (eventInput) => {
    const newEvent = {
      id: `event-${Date.now()}`,
      ...eventInput,
      assignedMemberIds: eventInput.assignedMemberIds || []
    };

    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        await supabase.from('events').insert([{
          id: newEvent.id,
          family_id: family.id,
          title: newEvent.title,
          date: newEvent.date,
          start_time: newEvent.startTime || null,
          end_time: newEvent.endTime || null,
          all_day: newEvent.allDay || false,
          location: newEvent.location || null,
          notes: newEvent.notes || null
        }]);

        if (newEvent.assignedMemberIds.length > 0) {
          const rows = newEvent.assignedMemberIds.map((memberId) => ({ event_id: newEvent.id, member_id: memberId }));
          await supabase.from('event_assignments').insert(rows);
        }

        setEvents((current) => [newEvent, ...current]);
        return newEvent;
      } catch (e) {
        console.warn('Supabase addEvent failed', e);
      }
    }

    setEvents((current) => [newEvent, ...current]);
    return newEvent;
  };

  const updateEvent = async (eventId, updates) => {
    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        await supabase.from('events').update({
          title: updates.title,
          date: updates.date,
          start_time: updates.startTime || null,
          end_time: updates.endTime || null,
          all_day: updates.allDay || false,
          location: updates.location || null,
          notes: updates.notes || null
        }).eq('id', eventId);

        if (Array.isArray(updates.assignedMemberIds)) {
          // Replace assignments: delete existing, insert new
          await supabase.from('event_assignments').delete().eq('event_id', eventId);
          const rows = updates.assignedMemberIds.map((memberId) => ({ event_id: eventId, member_id: memberId }));
          if (rows.length) await supabase.from('event_assignments').insert(rows);
        }

      } catch (e) {
        console.warn('Supabase updateEvent failed', e);
      }
    }

    setEvents((current) => current.map((event) => (event.id === eventId ? { ...event, ...updates } : event)));
  };

  const deleteEvent = async (eventId) => {
    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        await supabase.from('event_assignments').delete().eq('event_id', eventId);
        await supabase.from('events').delete().eq('id', eventId);
      } catch (e) {
        console.warn('Supabase deleteEvent failed', e);
      }
    }

    setEvents((current) => current.filter((event) => event.id !== eventId));
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

        if (!error && data) {
          setMembers((current) => [...current, data]);
          return data;
        }
      } catch (e) {
        console.warn('Supabase addMember failed', e);
      }
    }

    setMembers((current) => [...current, member]);
    return member;
  };

  const removeMember = async (memberId) => {
    if (hasSupabaseConfig && supabase && family?.id) {
      try {
        await supabase.from('event_assignments').delete().eq('member_id', memberId);
        await supabase.from('members').delete().eq('id', memberId);
      } catch (e) {
        console.warn('Supabase removeMember failed', e);
      }
    }

    setMembers((current) => current.filter((member) => member.id !== memberId));
    setEvents((current) => current.map((event) => ({ ...event, assignedMemberIds: event.assignedMemberIds.filter((id) => id !== memberId) })));
  };

  const value = useMemo(
    () => ({
      user,
      family,
      members,
      events,
      currentMonth,
      setCurrentMonth,
      login,
      logout,
      joinFamily,
      addEvent,
      updateEvent,
      deleteEvent,
      addMember,
      removeMember,
      createDateKey
    }),
    [user, family, members, events, currentMonth]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}

export default AppContext;
