// PHARMALIV : serveur Vercel. Un seul point d'entrée : POST /api  (corps JSON {a:"action", ...}).
// Base de données : Upstash Redis (Vercel > Storage). Toutes les règles de sécurité sont appliquées ICI.
const crypto=require("crypto"),E=process.env;
const RU=E.KV_REST_API_URL||E.UPSTASH_REDIS_REST_URL,RT=E.KV_REST_API_TOKEN||E.UPSTASH_REDIS_REST_TOKEN;
const ER=(m,c=400)=>Object.assign(new Error(m),{c});
const jp=s=>{try{return JSON.parse(s)}catch(e){return null}};
async function R(...c){const r=await fetch(RU,{method:"POST",headers:{Authorization:"Bearer "+RT,"Content-Type":"application/json"},body:JSON.stringify(c)});const j=await r.json();if(j.error)throw new Error("Base : "+j.error);return j.result}
const hg=async(k,f)=>{const v=await R("HGET",k,f);return v?jp(v):null};
const hs=(k,f,v)=>R("HSET",k,f,JSON.stringify(v));
const hall=async k=>{const a=(await R("HGETALL",k))||[],o=[];for(let i=1;i<a.length;i+=2){const v=jp(a[i]);if(v)o.push(v)}return o};
const bump=()=>R("INCR","ver");
const key=t=>String(t||"").replace(/[\s.-]/g,"").replace(/^\+?241/,"").replace(/^0/,"");
const okTel=t=>/^[67]\d{7}$/.test(key(t));
const str=(s,n)=>String(s==null?"":s).slice(0,n);
const today=()=>new Date().toISOString().slice(0,10);
const hr=()=>new Date().toLocaleString("fr-FR",{timeZone:"Africa/Libreville"});
const out=(res,c,o)=>{res.statusCode=c;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(o))};
const FEES=[2000,2500,3000,3500,4000],ZN=["Libreville","Owendo","Akanda","Essassa","Ntoum"];
const BRAND={c1:"#319E31",c2:"#058643",c3:"#363637",title:"Vos médicaments à domicile dans le Grand Libreville.",sub:"Commande sans compte, paiement Airtel Money ou Moov Money.",promo:""};
const live=()=>!!(E.INTOUCH_BASE_URL&&E.INTOUCH_AGENCY_CODE&&E.INTOUCH_PARTNER_ID&&E.INTOUCH_USERNAME&&E.INTOUCH_PASSWORD);
const GW=()=>({live:live(),demo:E.MODE_DEMO==="1",tel:{airtel:E.PAY_AIRTEL||"",moov:E.PAY_MOOV||""}});
/* ---------- sécurité ---------- */
const hash=(p,salt)=>crypto.scryptSync(String(p),salt,32).toString("hex");
const teq=(a,b)=>crypto.timingSafeEqual(crypto.createHash("sha256").update(String(a)).digest(),crypto.createHash("sha256").update(String(b)).digest());
const sign=p=>{const b=Buffer.from(JSON.stringify(p)).toString("base64url");return b+"."+crypto.createHmac("sha256",E.SESSION_SECRET).update(b).digest("base64url")};
function verify(t){const[b,s]=String(t||"").split(".");if(!b||!s)return null;const e=crypto.createHmac("sha256",E.SESSION_SECRET).update(b).digest("base64url");if(e.length!==s.length||!crypto.timingSafeEqual(Buffer.from(e),Buffer.from(s)))return null;const p=jp(Buffer.from(b,"base64url").toString());return p&&p.exp>Date.now()?p:null}
async function lim(k,max,sec){const n=await R("INCR","rl:"+k);if(n===1)await R("EXPIRE","rl:"+k,sec);if(n>max)throw ER("Trop de tentatives. Réessayez plus tard.",429)}
const pub=u=>{const{salt,h,...p}=u;return p};
async function ensureAdmin(){let a=await hg("users","u-admin");if(!a){a={id:"u-admin",role:"admin",name:"PHARMALIV HQ",phone:E.ADMIN_PHONE,status:"active",wallet:0,momo:E.ADMIN_PHONE,momoOp:"Airtel Money"};await hs("users","u-admin",a)}return a}
async function who(req){const t=(req.headers.authorization||"").replace(/^Bearer /,""),p=t&&verify(t);if(!p)return null;const u=await hg("users",p.uid);return u&&u.status==="active"?u:null}
/* ---------- InTouch ---------- */
async function callIT(body){const r=await fetch(`${E.INTOUCH_BASE_URL}/${E.INTOUCH_AGENCY_CODE}/transaction`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Basic "+Buffer.from(E.INTOUCH_USERNAME+":"+E.INTOUCH_PASSWORD).toString("base64")},body:JSON.stringify({...body,partner_id:E.INTOUCH_PARTNER_ID,login_api:E.INTOUCH_LOGIN_API,password_api:E.INTOUCH_PASSWORD_API})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||"InTouch a refusé la demande");return j}
const opk=o=>/moov/i.test(o)?"MOOV":"AIRTEL",tel=t=>"241"+key(t);
async function startPay(o){const pt=o.id.slice(1)+"-"+Date.now();o.payRef=pt;if(live()){await callIT({service_id:E["INTOUCH_SERVICE_"+opk(o.op)],recipient_phone_number:tel(o.phone),amount:o.total,partner_transaction_id:pt,call_back_url:(E.PUBLIC_URL||"")+"/api?cb=intouch&s="+encodeURIComponent(E.CALLBACK_SECRET||"")});await R("SET","pay:"+pt,o.id,"EX",86400)}}
/* ---------- notifications, argent ---------- */
async function note(to,uid,msg,code){await R("LPUSH","nf",JSON.stringify({to,uid,msg,code,t:new Date().toLocaleTimeString("fr-FR",{timeZone:"Africa/Libreville"})}));await R("LTRIM","nf",0,99)}
async function addWd(w){w.id=Date.now()*1000+Math.floor(Math.random()*1000);w.t=hr();await R("LPUSH","wd",JSON.stringify(w));await R("LTRIM","wd",0,299);return w}
async function markPaid(o,ref){if(!["new","push","await","verif"].includes(o.status))return;o.status="paid";await hs("orders",o.id,o);
 await R("LPUSH","tx",JSON.stringify({t:hr(),id:o.id,op:o.op,total:o.total,liv:o.split.liv,pl:o.split.pl,pharm:o.split.pharm,ref:ref||o.id}));await R("LTRIM","tx",0,499);
 const a=await ensureAdmin();a.wallet=(a.wallet||0)+o.split.pl;await hs("users","u-admin",a);
 await note("pharma","",o.id+" : paiement reçu, à préparer",o.id);await note("client","",o.id+" · paiement confirmé",o.id)}
async function payPharm(o,pu){if(o.paidOut||!o.split.pharm)return;o.paidOut=true;const w={who:pu.name,uid:pu.id,op:pu.momoOp||"",tel:pu.momo||"",amt:o.split.pharm,st:"demande",ref:"SPLIT "+o.id};
 try{if(live()){const j=await callIT({service_id:E["INTOUCH_PAYOUT_"+opk(w.op)],recipient_phone_number:tel(w.tel),amount:w.amt,partner_transaction_id:"PH"+o.id.slice(1)+"-"+Date.now()});w.st="envoye";w.ref=j.gu_transaction_id||"INTOUCH "+o.id}else if(GW().demo){w.st="envoye";w.ref="SIMULATION "+o.id}}catch(e){w.ref="ECHEC : "+e.message}
 await addWd(w);await note("pharma",pu.id,o.id+" : "+w.amt+" FCFA "+(w.st==="envoye"?"versés sur "+w.op+" "+w.tel:"en attente de versement"))}
/* ---------- catalogue de départ ---------- */
async function seed(){if(await R("SETNX","seeded",1)){const P=[[1,"Paracétamol 500 mg","Médicaments",1200,300,"💊",1,0,"fièvre douleur mal de tête céphalée courbatures"],[2,"Amoxicilline 1 g","Médicaments",3500,700,"💊",1,1,"infection angine otite bactérie"],[3,"Sirop contre la toux","Médicaments",2800,560,"🧪",1,0,"toux gorge rhume"],[4,"Sérum physiologique","Parapharmacie",1500,0,"💧",1,0,"nez bouché rhume yeux lavage"],[5,"Crème hydratante","Parapharmacie",6500,0,"🧴",1,0,"peau sèche hydratation"],[6,"Vitamine C 1000","Parapharmacie",4200,0,"🍊",0,0,"fatigue immunité"],[7,"Thermomètre digital","Parapharmacie",3800,0,"🌡️",1,0,"fièvre température"],[8,"Masques chirurgicaux x50","Parapharmacie",2500,0,"😷",1,0,"protection grippe virus"],[9,"Ibuprofène 400 mg","Médicaments",1800,360,"💊",1,1,"douleur inflammation fièvre mal de dents"]];
 for(const a of P)await hs("prods",a[0],{id:a[0],name:a[1],cat:a[2],price:a[3],tm:a[4],pic:a[5],stock:!!a[6],rx:!!a[7],sym:a[8]})}}
function cleanProd(d,id){const name=str(d.name,80).trim(),price=Math.round(+d.price),tm=Math.round(+d.tm||0);if(!name||!(price>=0)||price>1e7||!(tm>=0))throw ER("Produit invalide (nom et prix obligatoires).");
 const pic=typeof d.pic==="string"&&d.pic.startsWith("data:image")&&d.pic.length<60000?d.pic:str(d.pic||"💊",8);
 return{id,name,cat:d.cat==="Parapharmacie"?"Parapharmacie":"Médicaments",price,tm,rx:!!d.rx,stock:d.stock!==false,pic,sym:str(d.sym,160)}}
/* ---------- synchronisation (instantané filtré selon le rôle) ---------- */
async function snap(me,b){
 const v=+(await R("GET","ver"))||0;if(b.ver===v)return{same:true};
 await seed();
 const[prods,orders,nf,brand,n]=await Promise.all([hall("prods"),hall("orders"),R("LRANGE","nf",0,59),R("GET","brand"),R("GET","n:"+today())]);
 const r={ver:v,now:Date.now(),gw:GW(),products:prods.sort((x,y)=>x.id-y.id),brand:jp(brand)||BRAND,n:+n||0,me:me?pub(me):null,tx:[],wd:[],users:[],notifs:[]};
 const nfs=(nf||[]).map(jp).filter(Boolean),t=b.track;let list;
 if(!me)list=t&&t.code?orders.filter(o=>o.id===t.code&&key(o.phone)===key(t.phone)):[];
 else if(me.role==="client")list=orders.filter(o=>o.uid===me.id);
 else if(me.role==="pharma")list=orders.filter(o=>!["done","await"].includes(o.status)&&(!o.pid||o.pid===me.id));
 else if(me.role==="livreur")list=orders.filter(o=>o.status==="ready"||(o.status==="delivering"&&o.lid===me.id));
 else list=orders;
 r.orders=list.map(o=>{o={...o};const mine=!me?true:o.uid===me.id;if(!mine)delete o.otp;if(o.status==="delivering")o.prog=Math.min(.95,(Date.now()-(o.t0||Date.now()))/900000);if(o.status==="done")o.prog=1;return o});
 if(!me||me.role==="client")r.notifs=nfs.filter(x=>x.to==="client"&&list.some(o=>o.id===x.code)).slice(0,20);
 else if(me.role==="admin")r.notifs=nfs;else r.notifs=nfs.filter(x=>x.to===me.role&&(!x.uid||x.uid===me.id));
 if(me){const W=((await R("LRANGE","wd",0,299))||[]).map(jp).filter(Boolean);r.wd=me.role==="admin"?W:W.filter(w=>w.uid===me.id)}
 if(me&&me.role==="admin"){r.tx=((await R("LRANGE","tx",0,299))||[]).map(jp).filter(Boolean);r.users=(await hall("users")).map(pub)}
 return r}
/* ---------- commande ---------- */
async function mkOrder(b,me,ip){
 if(!/^#P\d{3,}$/.test(String(b.code)))throw ER("Code de commande invalide");
 const nm=str(b.name,80).trim(),adr=str(b.adr,160).trim();if(!nm||!adr||!okTel(b.phone))throw ER("Nom, adresse et téléphone valides obligatoires.");
 const zone=Math.floor(+b.zone);if(!(zone>=0&&zone<FEES.length))throw ER("Zone invalide");
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>30)throw ER("Panier vide");
 const P={};(await hall("prods")).forEach(p=>P[p.id]=p);const items=[];let prods=0,rx=false;const ins=b.insured?200:0;
 for(const it of b.items){const p=P[it.id],q=Math.floor(+it.q);if(!p||!p.stock||!(q>0)||q>20)throw ER("Un produit n'est plus disponible.");const u=b.insured?p.tm:p.price;items.push({name:p.name,q,u,rx:!!p.rx});prods+=q*u;if(p.rx)rx=true}
 const imgs={};const big=s=>typeof s==="string"&&s.startsWith("data:image")&&s.length<900000;
 let ocr=null,hasOrdo=false;
 if(b.insured){const c=b.ocr||{},I=c.imgs||{};if(!["ord","card","id"].every(k=>big(I[k])))throw ER("Ajoutez l’ordonnance, la carte d’assuré et la pièce d’identité.");
  ocr={name:str(c.name,80),num:str(c.num,40),date:str(c.date,20),q:+c.q||0,taux:+c.taux||80,docs:(Array.isArray(c.docs)?c.docs:[]).slice(0,5).map(x=>str(x,40)),imgs:{ord:1,card:1,id:1},wm:1,numOk:false};["ord","card","id"].forEach(k=>imgs[k]=I[k])}
 else if(rx){if(!big(b.ordo))throw ER("Une ordonnance est obligatoire pour ces médicaments.");imgs.ordo=b.ordo;hasOrdo=true}
 else if(big(b.ordo)){imgs.ordo=b.ordo;hasOrdo=true}
 const pm=b.pm==="p2p"?"p2p":"auto",g=GW();if(pm==="auto"&&!g.live&&!g.demo)throw ER("Le paiement automatique n’est pas encore disponible. Choisissez « Transfert direct ».");
 const fee=FEES[zone],o={uid:me&&["client","admin"].includes(me.role)?me.id:null,ordo:hasOrdo,id:b.code,name:nm,phone:str(b.phone,20),adr,zone,fee,prods,ins,total:prods+fee+ins,items,insured:!!b.insured,ocr,op:/moov/i.test(b.op)?"Moov Money":"Airtel Money",otp:String(crypto.randomInt(1000,10000)),status:pm==="p2p"?"await":(rx||b.insured?"new":"push"),pm:pm==="p2p"?"p2p":"auto",prog:0,split:{liv:Math.round(fee*.8),pl:Math.round(fee*.2)+ins,pharm:prods},pid:null,lid:null,rxOk:false,ts:Date.now()};
 if(!(await R("HSETNX","orders",o.id,JSON.stringify(o))))throw ER("Ce code de commande est déjà utilisé. Réessayez.");
 for(const k of Object.keys(imgs))await R("SET","img:"+o.id+":"+k,imgs[k]);
 if(o.status==="push"){try{await startPay(o)}catch(e){o.status="new";o.payErr=e.message}}
 await hs("orders",o.id,o);
 await note("pharma","",o.id+(o.status==="await"?" · en attente d'un transfert":o.status==="push"?" · paiement en cours":" : à valider"),o.id);await note("client","",o.id+" • commande envoyée",o.id);
 return o}
/* ---------- point d'entrée ---------- */
module.exports=async(req,res)=>{
 res.setHeader("Cache-Control","no-store");
 try{
  if(!RU||!RT)throw ER("Base de données non configurée (Upstash Redis).",500);
  if(!E.SESSION_SECRET||E.SESSION_SECRET.length<16)throw ER("SESSION_SECRET manquant (16 caractères minimum).",500);
  const url=new URL(req.url,"http://x"),ip=(req.headers["x-forwarded-for"]||"x").split(",")[0].trim();
  if(url.searchParams.get("cb")==="intouch")return await cb(req,res,url);
  if(req.method!=="POST")return out(res,405,{erreur:"Méthode non autorisée"});
  const b=req.body&&typeof req.body==="object"?req.body:(jp(req.body)||{}),me=await who(req);
  const need=(...r)=>{if(!me)throw ER("Connexion requise.",401);if(me.role!=="admin"&&!r.includes(me.role))throw ER("Accès refusé.",403)};
  const getO=async()=>{const o=await hg("orders",str(b.code,12));if(!o)throw ER("Commande introuvable.",404);return o};
  const owner=o=>key(o.phone)===key(b.phone)||(me&&o.uid===me.id);
  const canP=o=>me.role==="admin"||!o.pid||o.pid===me.id,ok=()=>out(res,200,{ok:true});
  const save=async o=>{await hs("orders",o.id,o);await bump();return ok()};
  switch(b.a){
  case"sync":return out(res,200,await snap(me,b));
  case"nextcode":{await lim("nc:"+ip,40,3600);const n=await R("INCR","n:"+today());await R("EXPIRE","n:"+today(),172800);return out(res,200,{code:"#P"+String(n).padStart(3,"0")})}
  case"register":{await lim("rg:"+ip,10,3600);const role=b.role;if(!["client","pharma","livreur"].includes(role))throw ER("Espace invalide.");
   const name=str(b.name,60).trim();if(!name||!okTel(b.phone)||!/^\d{4}$/.test(String(b.pin)))throw ER("Nom, téléphone gabonais et code PIN à 4 chiffres obligatoires.");
   if(role!=="client"&&!okTel(b.momo))throw ER("Le numéro Mobile Money est obligatoire.");
   const k=key(b.phone);if(await R("HGET","uidx",role+":"+k))throw ER("Ce numéro a déjà un compte. Connectez-vous.");
   const id="u"+Date.now().toString(36)+crypto.randomBytes(3).toString("hex"),salt=crypto.randomBytes(8).toString("hex");
   const u={id,role,name,phone:str(b.phone,20),salt,h:hash(b.pin,salt),status:role==="client"?"active":"pending",wallet:0,ts:Date.now()};
   if(role==="client"){u.adr=str(b.adr,160);u.zone=Math.max(0,Math.min(4,Math.floor(+b.zone)||0));u.op=/moov/i.test(b.op)?"Moov Money":"Airtel Money"}else{u.momo=str(b.momo,20);u.momoOp=/moov/i.test(b.momoOp)?"Moov Money":"Airtel Money"}
   await hs("users",id,u);await R("HSET","uidx",role+":"+k,id);
   if(role==="client"&&b.claim&&b.claim.code){const o=await hg("orders",str(b.claim.code,12));if(o&&!o.uid&&key(o.phone)===k){o.uid=id;await hs("orders",o.id,o)}}
   if(u.status==="pending")await note("admin","","Nouvelle demande : "+name+" ("+(role==="pharma"?"pharmacie":"livreur")+")");
   await bump();if(u.status==="pending")return out(res,200,{ok:true,pending:true});
   return out(res,200,{token:sign({uid:id,exp:Date.now()+30*864e5}),me:pub(u)})}
  case"login":{const role=b.role,k=key(b.phone);await lim("lg:"+role+":"+k,8,900);await lim("lgip:"+ip,40,900);let u;
   if(role==="admin"){if(!E.ADMIN_PHONE||!E.ADMIN_PASSWORD||k!==key(E.ADMIN_PHONE)||!teq(b.pin,E.ADMIN_PASSWORD))throw ER("Identifiants incorrects.",401);u=await ensureAdmin()}
   else{if(!["client","pharma","livreur"].includes(role))throw ER("Espace invalide.");const id=await R("HGET","uidx",role+":"+k);u=id&&await hg("users",id);if(!u||u.h!==hash(b.pin,u.salt))throw ER("Numéro ou code PIN incorrect.",401);
    if(u.status==="pending")throw ER("Votre compte est en attente de validation par PHARMALIV.",403);if(u.status!=="active")throw ER("Compte suspendu. Contactez PHARMALIV.",403)}
   await R("DEL","rl:lg:"+role+":"+k);return out(res,200,{token:sign({uid:u.id,exp:Date.now()+30*864e5}),me:pub(u)})}
  case"order":{await lim("or:"+ip,30,3600);const o=await mkOrder(b,me,ip);await bump();return out(res,200,{code:o.id,status:o.status})}
  case"p2pdone":{const o=await getO();if(!owner(o)||o.status!=="await")throw ER("Action impossible.");const t=str(b.txRef,60).trim();if(!t)throw ER("Indiquez votre numéro émetteur ou l’ID de transaction.");o.txRef=t;o.status="verif";await note("pharma","",o.id+" : transfert à vérifier ("+t+")",o.id);await note("client","",o.id+" • en attente de vérification",o.id);return save(o)}
  case"demopay":case"payfail":{if(!GW().demo)throw ER("Indisponible.",403);const o=await getO();if(!owner(o)||o.status!=="push")throw ER("Action impossible.");
   if(b.a==="demopay"){await markPaid(o,"DEMO-"+o.id)}else{o.status="new";await note("pharma","",o.id+" : paiement refusé par le client",o.id);await hs("orders",o.id,o)}await bump();return ok()}
  case"img":{const o=await getO();if(!(o.uid&&me&&o.uid===me.id)){need("pharma");if(me.role==="pharma"&&!canP(o))throw ER("Accès refusé.",403)}const k=String(b.k);if(!["ordo","ord","card","id"].includes(k))throw ER("Image inconnue.");const im=await R("GET","img:"+o.id+":"+k);if(!im)throw ER("Image introuvable.",404);return out(res,200,{img:im})}
  case"track":return out(res,200,await snap(null,{track:b}));
  /* --- pharmacie --- */
  case"okrx":{need("pharma");const o=await getO();if(!canP(o))throw ER("Prise en charge par une autre pharmacie.",403);o.rxOk=true;return save(o)}
  case"savenum":{need("pharma");const o=await getO();if(!canP(o)||!o.ocr)throw ER("Action impossible.");o.ocr.num=str(b.num,40).trim();o.ocr.numOk=true;return save(o)}
  case"pushpay":{need("pharma");const o=await getO();if(!canP(o)||o.status!=="new")throw ER("Action impossible.");
   if(o.items.some(i=>i.rx)&&!(o.rxOk||(o.ocr&&o.ocr.numOk)))throw ER("Vérifiez d’abord l’ordonnance du client.");const g=GW();if(!g.live&&!g.demo)throw ER("Le paiement automatique n’est pas configuré.");
   if(me.role==="pharma")o.pid=me.id;o.status="push";try{await startPay(o)}catch(e){o.status="new";await hs("orders",o.id,o);throw ER("Push non abouti : "+e.message)}await note("client","",o.id+" • demande de paiement reçue sur votre téléphone",o.id);return save(o)}
  case"oktr":{need("pharma");const o=await getO();if(!canP(o)||o.status!=="verif")throw ER("Action impossible.");if(me.role==="pharma")o.pid=me.id;o.op+=" (transfert)";await markPaid(o,o.txRef||"TRANSFERT");await bump();return ok()}
  case"setst":{need("pharma");const o=await getO();if(!canP(o))throw ER("Prise en charge par une autre pharmacie.",403);
   if(b.st==="prep"&&o.status==="paid"){const pu=me.role==="pharma"?me:(await hall("users")).find(u=>u.role==="pharma"&&u.status==="active");if(!pu)throw ER("Aucune pharmacie validée.");o.pid=pu.id;o.status="prep";await payPharm(o,pu);await note("client","",o.id+" · votre commande est en préparation",o.id)}
   else if(b.st==="ready"&&o.status==="prep"){o.status="ready";await note("livreur","",o.id+" prête pour retrait · "+ZN[o.zone]);await note("client","",o.id+" · prête, un livreur arrive",o.id)}
   else throw ER("Action impossible.");return save(o)}
  case"prodsave":{need("pharma");const id=b.id?+b.id:Date.now();await hs("prods",id,cleanProd(b,id));await bump();return ok()}
  case"prodbulk":{need("pharma");const L=Array.isArray(b.list)?b.list.slice(0,300):[];let i=0;for(const d of L){const id=Date.now()+(i++);await hs("prods",id,cleanProd(d,id))}await bump();return ok()}
  case"prodstock":{need("pharma");const p=await hg("prods",+b.id);if(!p)throw ER("Produit introuvable.");p.stock=!p.stock;await hs("prods",p.id,p);await bump();return ok()}
  case"proddel":{need("pharma");await R("HDEL","prods",+b.id);await bump();return ok()}
  /* --- livreur --- */
  case"pickup":{need("livreur");const o=await getO();if(o.status!=="ready"||o.lid)throw ER("Course non disponible.");if(String(b.ref).trim().toUpperCase()!==o.id)throw ER("Code incorrect. Demandez le code affiché à l’officine.");o.lid=me.id;o.status="delivering";o.t0=Date.now();await note("client","",o.id+" · le livreur est en route",o.id);return save(o)}
  case"gps":{need("livreur");const o=await getO();const la=+b.lat,lo=+b.lng;if(o.status!=="delivering"||(o.lid!==me.id&&me.role!=="admin")||!(la>-5&&la<5&&lo>8&&lo<15))throw ER("Action impossible.");o.gps={lat:la,lng:lo,t:Date.now()};return save(o)}
  case"deliver":{need("livreur");const o=await getO();if(o.status!=="delivering"||(o.lid!==me.id&&me.role!=="admin"))throw ER("Action impossible.");if(String(b.otp).trim()!==o.otp)throw ER("Code OTP incorrect.");
   o.status="done";o.prog=1;const lu=await hg("users",o.lid);if(lu){lu.wallet=(lu.wallet||0)+o.split.liv;await hs("users",lu.id,lu)}await note("client","",o.id+" · livrée, merci !",o.id);await note("livreur",o.lid,"Livraison "+o.id+" validée : +"+o.split.liv+" FCFA");return save(o)}
  case"withdraw":{need("pharma","livreur");if(!(me.wallet>0))throw ER("Aucun solde à retirer.");if(!me.momo)throw ER("Ajoutez votre numéro Mobile Money.");const amt=me.wallet;me.wallet=0;await hs("users",me.id,me);await addWd({who:me.name,uid:me.id,op:me.momoOp,tel:me.momo,amt,st:"demande"});await note("admin","","Demande de retrait : "+me.name+" · "+amt+" FCFA");await bump();return ok()}
  /* --- admin --- */
  case"paywd":{need("admin");const L=((await R("LRANGE","wd",0,299))||[]).map(jp),i=L.findIndex(w=>w&&w.id===+b.id);if(i<0||L[i].st!=="demande")throw ER("Retrait introuvable.");const w=L[i];
   if(live()){const j=await callIT({service_id:E["INTOUCH_PAYOUT_"+opk(w.op)],recipient_phone_number:tel(w.tel),amount:w.amt,partner_transaction_id:"WD"+w.id});w.ref=j.gu_transaction_id||"INTOUCH"}else w.ref="MANUEL";
   w.st="envoye";await R("LSET","wd",i,JSON.stringify(w));await bump();return ok()}
  case"approve":{need("admin");const u=await hg("users",str(b.id,40));if(!u||u.role==="admin")throw ER("Compte introuvable.");u.status=b.ok?"active":"blocked";await hs("users",u.id,u);await bump();return ok()}
  case"resetpin":{need("admin");const u=await hg("users",str(b.id,40));if(!u||u.role==="admin"||!/^\d{4}$/.test(String(b.pin)))throw ER("Données invalides.");u.salt=crypto.randomBytes(8).toString("hex");u.h=hash(b.pin,u.salt);await hs("users",u.id,u);await bump();return ok()}
  case"brand":{need("admin");const c=x=>/^#[0-9a-fA-F]{6}$/.test(x)?x:null;await R("SET","brand",JSON.stringify({c1:c(b.c1)||BRAND.c1,c2:c(b.c2)||BRAND.c2,c3:c(b.c3)||BRAND.c3,title:str(b.title,120),sub:str(b.sub,200),promo:str(b.promo,160)}));await bump();return ok()}
  default:throw ER("Action inconnue.")}
 }catch(e){out(res,e.c||500,{erreur:e.c?e.message:"Erreur serveur."});if(!e.c)console.error(e)}};
async function cb(req,res,url){const b=req.body&&typeof req.body==="object"?req.body:(jp(req.body)||{});
 if(E.CALLBACK_SECRET&&url.searchParams.get("s")!==E.CALLBACK_SECRET)return out(res,403,{erreur:"refusé"});
 const code=await R("GET","pay:"+b.partner_transaction_id),o=code&&await hg("orders",code),st=String(b.status||b.statut||b.code||"");
 if(o&&/^(SUCCESS|SUCCESSFUL|00)$/i.test(st)){await markPaid(o,b.gu_transaction_id||b.reference);await bump()}
 else if(o&&o.status==="push"&&/^(FAILED|ECHEC|ERROR|CANCELLED)$/i.test(st)){o.status="new";await hs("orders",o.id,o);await note("pharma","","Paiement "+o.id+" non abouti",o.id);await bump()}
 out(res,200,{ok:true})}
