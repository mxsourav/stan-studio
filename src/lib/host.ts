/**
 * Host classification for domain isolation — computed once per page load.
 * admin.* hosts (admin.mxsourav.dev) serve the admin panel exclusively;
 * localhost keeps both sides reachable for development.
 */
export const HOSTNAME = window.location.hostname;
export const IS_ADMIN_HOST = HOSTNAME.startsWith('admin.');
export const ADMIN_ALLOWED = IS_ADMIN_HOST || HOSTNAME === 'localhost' || HOSTNAME === '127.0.0.1';
