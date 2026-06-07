// utils/constants.js
export const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || '1513271743513628763';

// Spawner types with custom emoji placeholders.
// Replace the emoji IDs with your actual server emoji IDs.
// Format: <:name:id>  — right-click any custom emoji in Discord > Copy Emoji ID
export const SPAWNERS = [
  { id: 'skeleton', label: 'Skeleton Spawner',   emoji: '<:skeleton:1513285663921799179>' },
  { id: 'creeper',  label: 'Creeper Spawner',    emoji: '<:Creeper:1513285639385120928>' },
  { id: 'golem',    label: 'Iron Golem Spawner', emoji: '<:golem:1513285685501759749>' },
];

export const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;

export const COLORS = {
  primary:  0x1a1a2e,
  accent:   0xe8b86d,
  success:  0x57f287,
  danger:   0xed4245,
  info:     0x5865f2,
  bone:     0xf5f0e8,
};

// Helper: check if member has owner role
export function isOwner(member) {
  return member.roles.cache.has(OWNER_ROLE_ID);
}

// Format numbers with commas
export function fmt(n) {
  return Number(n).toLocaleString();
}
