import { ROUTES, UI_KEYS } from './constants.js';

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const segments = raw.split('/').filter(Boolean);
  const root = ROUTES[segments[0]] ? segments[0] : 'home';
  return { root, segments };
}

export function createRouter(onRoute) {
  const handle = () => {
    const route = parseHash();
    localStorage.setItem(UI_KEYS.lastRoute, route.root);
    onRoute(route);
  };

  window.addEventListener('hashchange', handle);

  if (!location.hash) {
    const lastRoute = localStorage.getItem(UI_KEYS.lastRoute);
    location.hash = `#/${ROUTES[lastRoute] ? lastRoute : 'home'}`;
  } else {
    handle();
  }

  return {
    navigate(path) {
      const cleaned = String(path || 'home').replace(/^#?\/?/, '');
      location.hash = `#/${cleaned}`;
    },
    current: parseHash
  };
}
