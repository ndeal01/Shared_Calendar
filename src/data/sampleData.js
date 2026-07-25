export const sampleFamily = {
  id: null,
  name: '',
  inviteCode: ''
};

export const sampleMembers = [];

export const sampleEvents = [];

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
