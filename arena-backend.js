'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DATA=process.env.DATA_DIR||'/data';
try{fs.mkdirSync(DATA,{recursive:true})}catch(e){console.error('Persistent data volume unavailable',e)}
const dbPath=path.join(DATA,'arcana-arena.json');
let db={users:{},sessions:{},matches:{}};
try{const loaded=JSON.parse(fs.readFileSync(dbPath,'utf8'));db={...db,...loaded}}catch(e){if(e.code!=='ENOENT')console.error('DB read',e.message)}
function persist(){const tmp=dbPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db));fs.renameSync(tmp,dbPath)}
const ids=['snow-white','cinderella','aurora','ariel','belle','jasmine','rapunzel','mulan','tiana','moana','elsa','anna'];
const names=['Snow White','Cinderella','Aurora','Ariel','Belle','Jasmine','Rapunzel','Mulan','Tiana','Moana','Elsa','Anna'];
const EXR={
 'azure-dragon':{name:'Azure Dragon',title:'Immortal Tempest',skills:['Eternal Tempest','Heavenbreaker']},
 'mecha-dragon':{name:'Mecha Dragon',title:'Unstoppable Machine',skills:['Infinity Cannon','Absolute Override']}
};
const EXR_IDS=Object.keys(EXR);
const namesById={...Object.fromEntries(ids.map((id,i)=>[id,names[i]])),...Object.fromEntries(EXR_IDS.map(id=>[id,EXR[id].name]))};

const skills={
 'snow-white':['Forest Light','Seven Stars'],'cinderella':['Midnight Bell','Glass Waltz'],'aurora':['Rose Thorns','Dream Veil'],
 'ariel':['Ocean Song','Tidal Surge'],'belle':['Rose Spell','Enchanted Courage'],'jasmine':['Desert Wind','Carpet Rush'],
 'rapunzel':['Sundrop Heal','Golden Radiance'],'mulan':['Honor Strike','Dragon Spirit'],'tiana':['Star Wish','Bayou Bloom'],
 'moana':['Wayfinder','Ocean Heart'],'elsa':['Frost Shard','Frozen Crown'],'anna':['Sisterly Courage','Unbreakable Bond']
};
const rank={N:0,R:1,SR:2,UR:3,EXR:4};
function json(res,status,body,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(body))}
function parseCookie(req){const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').slice(0,2)));return cookies.arcana_session||''}
function actor(req){const token=parseCookie(req),x=db.sessions[token];if(!x||x.expires<Date.now()){if(x){delete db.sessions[token];persist()}return null}return db.users[x.id]||null}
function safeUser(u){return {id:u.id,name:u.name,created:u.created,role:u.role||'player',record:u.record||{wins:0,losses:0},collection:u.collection||null,exr:u.exr||{}}}
function passwordHash(p,salt){return crypto.scryptSync(p,salt,64).toString('hex')}
// Create one administrator using Railway's secret variable; never allow public self-promotion.
function bootstrapAdmin(){
 const password=process.env.ARCANA_ADMIN_BOOTSTRAP_PASSWORD;
 if(!password||password.length<16){console.warn('Admin bootstrap not configured');return}
 let u=Object.values(db.users).find(x=>x.name.toLowerCase()==='arcanaadmin');
 if(!u){const salt=crypto.randomBytes(20).toString('hex'),id=crypto.randomUUID();
 u={id,name:'ArcanaAdmin',salt,pass:passwordHash(password,salt),role:'admin',created:Date.now(),record:{wins:0,losses:0},collection:{collection:{},deck:[]},exr:{}};
 db.users[id]=u;persist();console.log('Initial admin account provisioned');
 }else if(u.role!=='admin'){console.warn('Reserved admin username exists without administrator rights; refusing role escalation')}
}
bootstrapAdmin();
function session(res,u){const token=crypto.randomBytes(32).toString('hex');db.sessions[token]={id:u.id,expires:Date.now()+30*864e5};persist();return {'Set-Cookie':`arcana_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`}}
const cleanName=x=>String(x||'').trim();
const validDeck=(user,deck)=>{
 if(!Array.isArray(deck)||deck.length<1||deck.length>3||new Set(deck).size!==deck.length)return null;
 const collection=user.collection?.collection||{};
 if(deck.some(k=>!/^([a-z-]+)\|(N|R|SR|UR|EXR)$/.test(k) || !(k.endsWith('|EXR')?(EXR[k.split('|')[0]]&&user.exr?.[k]):(ids.includes(k.split('|')[0])&&collection[k]))))return null;
 return deck.map(k=>{const [id,r]=k.split('|'),n=rank[r],maxHp=r==='EXR'?999999:75+n*23;return {key:k,id,rarity:r,name:namesById[id],rank:n,hp:maxHp,maxHp,shield:0,cooldown:{},used:0}})
};
function brief(m,u){return {id:m.id,code:m.code,status:m.status,host:db.users[m.host]?.name,guest:db.users[m.guest]?.name||null,isHost:u.id===m.host,turn:m.turn,winner:m.winner?db.users[m.winner]?.name:null,yourId:u.id,teams:m.teams,log:m.log.slice(-18),created:m.created}}
function current(team){return team?.find(c=>c.hp>0)}
function skillOptions(card){if(card.rarity==='EXR'||card.rank===4){const x=EXR[card.id];return [
 {id:'strike',name:x?.skills[0]||'Absolute Strike',label:'⚡',description:'Instant knockout. Immune to all incoming damage.',cooldown:0,unlock:0},
 {id:'burst',name:x?.skills[1]||'Eternal Collapse',label:'☄',description:'Instant knockout. Immune to all incoming damage.',cooldown:0,unlock:0},
 {id:'guard',name:'Eternal Aegis',label:'♛',description:'Immortal defense',cooldown:0,unlock:0}
 ]}const n=card.rank;return [
 {id:'strike',name:'Basic Strike',label:'⚔',description:`Deal ${17+n*5}–${23+n*5} damage`,cooldown:0,unlock:0},
 {id:'guard',name:'Royal Guard',label:'🛡',description:`Block ${40+n*7}% of the next hit`,cooldown:1,unlock:0},
 {id:'heal',name:skills[card.id][0],label:'✧',description:`Restore ${18+n*7} HP`,cooldown:2,unlock:1},
 {id:'burst',name:skills[card.id][1],label:'✦',description:`Deal ${33+n*10}–${40+n*10} damage`,cooldown:3,unlock:2},
 {id:'ultimate',name:'Legendary Ascension',label:'♛',description:'Deal 70–82 damage and heal 15 HP',cooldown:4,unlock:3}
 ]}
function perform(m,u,skillId){
 if(m.status!=='battle'||m.turn!==u.id)throw Error('It is not your turn');
 const opponent=u.id===m.host?m.guest:m.host,friend=current(m.teams[u.id]),foe=current(m.teams[opponent]);
 if(!friend||!foe)throw Error('Battle finished');
 const skill=skillOptions(friend).find(s=>s.id===skillId);if(!skill||skill.unlock>friend.rank)throw Error('Skill is locked for this rarity');
 if((friend.cooldown[skillId]||0)>m.round)throw Error('Skill is on cooldown');
 const before=foe.hp;let line='';
 if(skillId==='guard'){friend.shield=friend.rarity==='EXR'?100:40+friend.rank*7;line=`${u.name} · ${friend.name} raised Royal Guard!`}
 else if(skillId==='heal'){const heal=Math.min(friend.maxHp-friend.hp,18+friend.rank*7);friend.hp+=heal;line=`${u.name} · ${friend.name} used ${skill.name} (+${heal} HP)`}
 else {let min=17+friend.rank*5,max=23+friend.rank*5;if(skillId==='burst'){min=33+friend.rank*10;max=40+friend.rank*10}if(skillId==='ultimate'){min=70;max=82;friend.hp=Math.min(friend.maxHp,friend.hp+15)}let damage=friend.rarity==='EXR'?foe.hp:crypto.randomInt(min,max+1);if(foe.rarity==='EXR')damage=0;if(foe.shield && foe.rarity!=='EXR' && friend.rarity!=='EXR'){damage=Math.max(1,Math.round(damage*(1-foe.shield/100)));foe.shield=0}foe.hp=Math.max(0,foe.hp-damage);line=`${u.name} · ${friend.name} used ${skill.name} for ${before-foe.hp} damage`;if(foe.hp===0)line+=` — ${foe.name} is defeated!`}
 if(skill.cooldown)friend.cooldown[skillId]=m.round+skill.cooldown+1;
 m.log.push(line);m.round++;m.turn=opponent;
 if(!current(m.teams[opponent])){m.status='complete';m.winner=u.id;m.turn=null;db.users[u.id].record.wins++;db.users[opponent].record.losses++;m.log.push(`♛ ${u.name} wins the royal duel!`)}
 m.updated=Date.now();persist();
}
const reqBody=req=>new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>80000){reject(Error('Request too large'));req.destroy()}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{})}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)});
function error(res,e){json(res,e.message==='Unauthorized'?401:400,{error:e.message||'Unexpected error'})}
async function handle(req,res,url){
 if(!url.pathname.startsWith('/api/'))return false;
 if(req.method==='GET'&&url.pathname==='/api/health'){json(res,200,{ok:true,accounts:true,multiplayer:true});return true}
 if(!['GET','POST'].includes(req.method)){json(res,405,{error:'Method not allowed'});return true}
 if(req.method==='POST'&&req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){json(res,403,{error:'Invalid request origin'});return true}}catch{json(res,403,{error:'Invalid request origin'});return true}}
 try {
 const body=req.method==='POST'?await reqBody(req):{};
 const route=url.pathname;
 if(route==='/api/register'&&req.method==='POST'){
  const name=cleanName(body.name),password=String(body.password||'');if(!/^[A-Za-z0-9_]{3,18}$/.test(name))throw Error('Username must be 3–18 letters, numbers, or underscores');if(password.length<10||password.length>128)throw Error('Password must be at least 10 characters');if(Object.values(db.users).some(x=>x.name.toLowerCase()===name.toLowerCase()))throw Error('Username taken');
  const salt=crypto.randomBytes(20).toString('hex'),id=crypto.randomUUID();const u={id,name,salt,pass:passwordHash(password,salt),created:Date.now(),record:{wins:0,losses:0},collection:{collection:{'snow-white|N':1,'aurora|N':1,'mulan|N':1},deck:[]}};db.users[id]=u;json(res,200,{user:safeUser(u)},session(res,u));return true;
 }
 if(route==='/api/login'&&req.method==='POST'){
  const name=cleanName(body.name),password=String(body.password||''),u=Object.values(db.users).find(x=>x.name.toLowerCase()===name.toLowerCase());if(!u||!crypto.timingSafeEqual(Buffer.from(u.pass,'hex'),Buffer.from(passwordHash(password,u.salt),'hex')))throw Error('Invalid username or password');json(res,200,{user:safeUser(u)},session(res,u));return true;
 }
 if(route==='/api/exr/catalog'&&req.method==='GET'){json(res,200,{cards:EXR_IDS.map(id=>({id,key:id+'|EXR',name:EXR[id].name,title:EXR[id].title,rarity:'EXR',hp:'∞',skills:EXR[id].skills}))});return true}
 if(route==='/api/logout'&&req.method==='POST'){delete db.sessions[parseCookie(req)];persist();json(res,200,{ok:true},{'Set-Cookie':'arcana_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});return true}
 const u=actor(req);if(route==='/api/me'&&req.method==='GET'){json(res,200,{user:u?safeUser(u):null});return true}
 if(!u)throw Error('Unauthorized');
 if(route==='/api/admin/gift'&&req.method==='POST'){
  if(u.role!=='admin')throw Error('Admin only');
  const targetName=cleanName(body.username),card=String(body.card||'');
  if(!EXR_IDS.some(id=>card===id+'|EXR'))throw Error('Invalid exclusive card');
  const target=Object.values(db.users).find(x=>x.name.toLowerCase()===targetName.toLowerCase());
  if(!target)throw Error('Player account not found');
  target.exr=target.exr||{};if(target.exr[card])throw Error('Player already owns this EXR card');
  target.exr[card]=1;db.gifts=db.gifts||[];db.gifts.push({by:u.id,to:target.id,card,at:Date.now()});persist();
  json(res,200,{ok:true,recipient:target.name,card});return true;
 }
 if(route==='/api/admin/gifts'&&req.method==='GET'){
  if(u.role!=='admin')throw Error('Admin only');
  json(res,200,{gifts:(db.gifts||[]).slice(-50).reverse().map(g=>({by:db.users[g.by]?.name,to:db.users[g.to]?.name,card:g.card,at:g.at}))});return true;
 }
 if(route==='/api/change-password'&&req.method==='POST'){
  const oldPass=String(body.currentPassword||''),next=String(body.newPassword||'');
  if(next.length<12||next.length>128)throw Error('New password must be at least 12 characters');
  const a=Buffer.from(u.pass,'hex'),b=Buffer.from(passwordHash(oldPass,u.salt),'hex');
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error('Incorrect current password');
  u.salt=crypto.randomBytes(20).toString('hex');u.pass=passwordHash(next,u.salt);
  for(const [token,sess] of Object.entries(db.sessions))if(sess.id===u.id)delete db.sessions[token];
  persist();json(res,200,{ok:true,message:'Password changed. Sign in again.'},{'Set-Cookie':'arcana_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});return true;
 }
 if(route==='/api/collection'&&req.method==='POST'){
   const saved=body.state;if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('Invalid collection');
   const collection={};for(const [key,n] of Object.entries(saved.collection||{})){if(/^([a-z-]+)\|(N|R|SR|UR)$/.test(key)&&ids.includes(key.split('|')[0])&&Number.isSafeInteger(n)&&n>=0&&n<=9999)collection[key]=n}
   u.collection={...saved,collection,deck:Array.isArray(saved.deck)?saved.deck.filter(x=>collection[x]).slice(0,5):[]};persist();json(res,200,{ok:true});return true;
 }
 if(route==='/api/collection'&&req.method==='GET'){json(res,200,{state:u.collection,exr:u.exr||{}});return true}
 if(route==='/api/create'&&req.method==='POST'){
  const team=validDeck(u,body.deck);if(!team)throw Error('Select 1–3 cards that you own');const code=crypto.randomBytes(4).toString('hex').toUpperCase();const m={id:crypto.randomUUID(),code,status:'waiting',host:u.id,guest:null,teams:{[u.id]:team},turn:null,round:1,winner:null,log:[`${u.name} opened the Royal Arena`],created:Date.now(),updated:Date.now()};db.matches[code]=m;persist();json(res,200,{match:brief(m,u)});return true;
 }
 if(route==='/api/join'&&req.method==='POST'){
  const code=String(body.code||'').trim().toUpperCase(),m=db.matches[code];if(!m)throw Error('Invite code not found');if(m.status==='waiting'&&m.host!==u.id){const team=validDeck(u,body.deck);if(!team)throw Error('Select 1–3 cards that you own');m.guest=u.id;m.teams[u.id]=team;m.status='battle';m.turn=m.host;m.log.push(`${u.name} joined. Battle begins!`);persist()}else if(u.id!==m.host&&u.id!==m.guest)throw Error('This room is full');json(res,200,{match:brief(m,u)});return true;
 }
 if(route==='/api/match'&&req.method==='GET'){
  const code=(url.searchParams.get('code')||'').toUpperCase(),m=db.matches[code];if(!m||![m.host,m.guest].includes(u.id))throw Error('Match not found');json(res,200,{match:brief(m,u)});return true;
 }
 if(route==='/api/action'&&req.method==='POST'){
  const code=String(body.code||'').toUpperCase(),m=db.matches[code];if(!m||![m.host,m.guest].includes(u.id))throw Error('Match not found');perform(m,u,String(body.skill||''));json(res,200,{match:brief(m,u)});return true;
 }
 if(route==='/api/skills'&&req.method==='GET'){
   const card=String(url.searchParams.get('card')||'').split('|'),n=rank[card[1]];if(!(ids.includes(card[0])||EXR[card[0]])||n===undefined)throw Error('Unknown card');json(res,200,{card:card.join('|'),skills:skillOptions({id:card[0],rank:n,rarity:card[1]})});return true;
 }
 json(res,404,{error:'Not found'});return true;
 }catch(e){error(res,e);return true}
}
module.exports={handle};