export function openDirectMessage(userId:string,name:string) {
 window.dispatchEvent(new CustomEvent('academy:dm-open',{detail:{userId,name}}))
}
