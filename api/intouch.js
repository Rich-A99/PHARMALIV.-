// Module InTouch pour PHARMALIV : collecte USSD + répartition automatique.
// Les montants sont TOUJOURS recalculés ici (jamais ceux du navigateur).
// À brancher dans votre serveur : const IT=require("./api/intouch"); puis dans votre routeur
//   if(await IT.handle(req,res,url,body)) return;     et ajoutez IT.sante() à /api/sante.
// Adaptez callInTouch() (URL, authentification, noms de champs) à la documentation InTouch reçue.
const E=process.env,TX=new Map(); // En production (Vercel), remplacez TX par une base (Redis, Postgres…).
const live=()=>!!(E.INTOUCH_BASE_URL&&E.INTOUCH_AGENCY_CODE&&E.INTOUCH_PARTNER_ID&&E.INTOUCH_USERNAME&&E.INTOUCH_PASSWORD);
const op=o=>/moov/i.test(o)?"moov":"airtel";
const tel=t=>"241"+String(t).replace(/[\s.+-]/g,"").replace(/^241/,"").replace(/^0/,"");
function split(prod,fee,ass){return{pharmacie:prod,livreur:Math.round(fee*.8),plateforme:Math.round(fee*.2)+(ass?200:0)}}
async function callInTouch(body){
  const r=await fetch(`${E.INTOUCH_BASE_URL}/${E.INTOUCH_AGENCY_CODE}/transaction`,{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Basic "+Buffer.from(E.INTOUCH_USERNAME+":"+E.INTOUCH_PASSWORD).toString("base64")},
    body:JSON.stringify({...body,partner_id:E.INTOUCH_PARTNER_ID,login_api:E.INTOUCH_LOGIN_API,password_api:E.INTOUCH_PASSWORD_API})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||"InTouch a refusé la demande");return j}
async function payoutPharmacie(t){ // versement automatique des produits à la pharmacie
  if(!t.momoPharmacie||t.versement)return;
  if(!live()){t.versement="SIMULE";return}
  try{await callInTouch({service_id:E["INTOUCH_PAYOUT_"+op(t.operateurPharmacie||"airtel").toUpperCase()],recipient_phone_number:tel(t.momoPharmacie),amount:t.repartition.pharmacie,partner_transaction_id:t.id+"-PH"});t.versement="ENVOYE"}catch(e){t.versement="ECHEC:"+e.message}}
async function succeed(t,ref){if(t.statut!=="EN_ATTENTE")return;t.statut="REUSSI";t.refOperateur=ref||t.id;await payoutPharmacie(t)}
const send=(res,c,o)=>{res.statusCode=c;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(o))};
exports.sante=()=>({intouch:live()});
exports.handle=async(req,res,url,b={})=>{
  if(req.method==="POST"&&url.pathname==="/api/paiements"){
    const prod=+b.produits||0,fee=+b.fraisZone||0;if(prod<=0||fee<=0)return send(res,400,{erreur:"Montants invalides"}),true;
    const rep=split(prod,fee,b.assurance),total=prod+fee+(b.assurance?200:0),id="IT"+Date.now();
    const t={id,code:b.code,operateur:op(b.operateur),telephone:b.telephone,total,repartition:rep,momoPharmacie:b.momoPharmacie,statut:"EN_ATTENTE"};TX.set(id,t);
    if(!/^(\+?241)?0?[67]\d{7}$/.test(String(b.telephone).replace(/[\s.-]/g,"")))return send(res,400,{erreur:"Numéro invalide"}),true;
    try{
      if(live())await callInTouch({service_id:E["INTOUCH_SERVICE_"+t.operateur.toUpperCase()],recipient_phone_number:tel(t.telephone),amount:total,partner_transaction_id:id,call_back_url:(E.PUBLIC_URL||"")+"/api/intouch/callback"});
      else setTimeout(()=>succeed(t,"SIM-"+id),3000); // simulation : confirmation après 3 s
