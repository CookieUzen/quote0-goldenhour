import dns from 'node:dns';
import net from 'node:net';

/**
 * Prefer IPv4 for outbound fetches. Some hosts (e.g. the geocoding API) publish
 * both A and AAAA records, and on networks without a working IPv6 route Node's
 * happy-eyeballs stalls with ETIMEDOUT while curl quietly falls back to IPv4.
 * Disabling autoSelectFamily makes Node use the first (IPv4-first) address.
 *
 * Imported for its side effect, before any fetch happens.
 */
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
