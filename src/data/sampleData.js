const today = new Date();

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function offsetDate(days) {
  const date = new Date(today);
  date.setDate(today.getDate() + days);
  return formatDateKey(date);
}

export const sampleFamily = {
  id: 'family-1',
  name: 'The Smith Family',
  inviteCode: 'SMITH123'
};

export const sampleMembers = [
  { id: 'member-1', name: 'Alice', color: '#ef4444', role: 'admin' },
  { id: 'member-2', name: 'Ben', color: '#3b82f6', role: 'member' },
  { id: 'member-3', name: 'Chloe', color: '#10b981', role: 'member' }
];

export const sampleEvents = [
  {
    id: 'event-1',
    title: 'Family dinner',
    date: offsetDate(1),
    startTime: '18:00',
    endTime: '19:30',
    allDay: false,
    location: 'Home',
    notes: 'Bring dessert',
    assignedMemberIds: ['member-1', 'member-2', 'member-3']
  },
  {
    id: 'event-2',
    title: 'Park playdate',
    date: offsetDate(2),
    startTime: '10:00',
    endTime: '12:00',
    allDay: false,
    location: 'Maple Park',
    notes: 'Pack snacks',
    assignedMemberIds: ['member-2']
  },
  {
    id: 'event-3',
    title: 'School pickup',
    date: formatDateKey(today),
    startTime: '15:30',
    endTime: '16:00',
    allDay: false,
    location: 'School',
    notes: 'Reminder: carpool',
    assignedMemberIds: ['member-1']
  }
];

export function formatDateLabel(dateKey) {
  const date = new Date(dateKey + 'T12:00:00');
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export function formatMonthLabel(date) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}
