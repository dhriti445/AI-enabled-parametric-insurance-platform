const KEY = 'insurance_user';

export function saveUser(user) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function getUser() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearUser() {
  localStorage.removeItem(KEY);
}
