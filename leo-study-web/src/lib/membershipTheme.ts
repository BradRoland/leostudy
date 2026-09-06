const rgb=(hex:string)=>[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16))
const hex=(values:number[])=>'#'+values.map(value=>Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,'0')).join('')
const mix=(first:string,second:string,amount:number)=>hex(rgb(first).map((value,index)=>value*amount+rgb(second)[index]*(1-amount)))
export const plusThemeIds=['midnight','pastel-sky','ocean-mint','pure-black']
export function themeAllowed(id:string,membership:'free'|'tier5'|'tier10',legacy='free') {
  return id==='midnight'||['tier5','tier10'].includes(legacy)||membership==='tier10'||membership==='tier5'&&plusThemeIds.includes(id)
}
export function themeContrast(first:string,second:string) {
  const light=(color:string)=>rgb(color).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0)
  const values=[light(first),light(second)].sort((a,b)=>b-a)
  return (values[0]+.05)/(values[1]+.05)
}
export function membershipPalette(input:string,light:boolean) {
  const original=/^#[0-9a-f]{6}$/i.test(input)?input:'#3159ed'
  const bg=mix(original,light?'#f8fafc':'#10151e',.025)
  const panel=mix(original,light?'#ffffff':'#19212e',.035)
  let accent=original
  for(let index=0;index<40&&themeContrast(accent,panel)<4.5;index++)accent=mix(accent,light?'#000000':'#ffffff',.93)
  const text=light?'#172233':'#f1f5fa',muted=light?'#536073':'#b1bed0'
  return {bg,panel,panelStrong:panel,sidebar:mix(original,light?'#ffffff':'#141c27',.025),text,muted,textMuted:muted,accent,
    border:light?'#ccd5e1':'#3b485c',good:light?'#16764b':'#66dba9',bad:light?'#bd3344':'#ff8792',gold:accent,bodyRadial:mix(original,bg,.07),bodyBase:bg}
}
