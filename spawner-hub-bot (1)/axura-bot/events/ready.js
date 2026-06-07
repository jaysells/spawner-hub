// events/ready.js
export const name = 'ready';
export const once = true;

export function execute(client) {
  console.log(`✅ Spawner Hub Bot online as ${client.user.tag}`);
}
