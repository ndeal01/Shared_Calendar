import { createContext, useContext, useMemo, useState } from 'react';
import { sampleEvents, sampleFamily, sampleMembers } from '../data/sampleData';

const AppContext = createContext({});

function createDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [family, setFamily] = useState(sampleFamily);
  const [members, setMembers] = useState(sampleMembers);
  const [events, setEvents] = useState(sampleEvents);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const login = (email, displayName) => {
    setUser({ email, displayName: displayName || email.split('@')[0] });
  };

  const logout = () => {
    setUser(null);
  };

  const joinFamily = (inviteCode) => {
    if (inviteCode.trim()) {
      setFamily((current) => ({ ...current, inviteCode: inviteCode.trim() }));
    }
  };

  const addEvent = (eventInput) => {
    const newEvent = {
      id: `event-${Date.now()}`,
      ...eventInput,
      assignedMemberIds: eventInput.assignedMemberIds || []
    };
    setEvents((current) => [newEvent, ...current]);
    return newEvent;
  };

  const updateEvent = (eventId, updates) => {
    setEvents((current) => current.map((event) => (event.id === eventId ? { ...event, ...updates } : event)));
  };

  const deleteEvent = (eventId) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  };

  const addMember = (name, color, role = 'member') => {
    const member = {
      id: `member-${Date.now()}`,
      name,
      color,
      role
    };
    setMembers((current) => [...current, member]);
    return member;
  };

  const removeMember = (memberId) => {
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
