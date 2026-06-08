// events/guildMemberAdd.js
export const name = 'guildMemberAdd';
export const once = false;

const MEMBER_ROLE_ID = '1513271951483863193';

export async function execute(member) {
  await member.roles.add(MEMBER_ROLE_ID).catch(err => {
    console.error(`Failed to assign member role to ${member.user.tag}:`, err);
  });
}
