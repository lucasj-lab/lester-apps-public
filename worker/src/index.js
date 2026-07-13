const APPS = new Set(['dashboard','finance','school','job','life']);
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const unb64 = value => atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4));
const decode = value => JSON.parse(unb64(value));

function cors(env, extra={}) { return {'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Access-Control-Allow-Credentials':'true','Vary':'Origin','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',...extra}; }
function json(env, body, status=200, extra={}) { return new Response(JSON.stringify(body),{status,headers:cors(env,{'Content-Type':'application/json; charset=utf-8',...extra})}); }
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function issue(email,env){const now=Math.floor(Date.now()/1000), head=b64u(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'}))), payload=b64u(enc.encode(JSON.stringify({sub:email,iat:now,exp:now+Number(env.SESSION_TTL_SECONDS||86400)}))), input=`${head}.${payload}`, sig=b64u(await crypto.subtle.sign('HMAC',await key(env.SESSION_SECRET),enc.encode(input)));return `${input}.${sig}`;}
async function session(request,env){const raw=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('lester_session='))?.slice(15);if(!raw)return null;try{const [h,p,s]=raw.split('.'),ok=await crypto.subtle.verify('HMAC',await key(env.SESSION_SECRET),Uint8Array.from(unb64(s),c=>c.charCodeAt(0)),enc.encode(`${h}.${p}`)),claims=decode(p);return ok&&claims.exp>Date.now()/1000?claims:null;}catch{return null;}}

export default {async fetch(request,env){
  const url=new URL(request.url), origin=request.headers.get('Origin');
  if(origin&&origin!==env.ALLOWED_ORIGIN)return json(env,{error:'Origin denied'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env,{'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'})});
  if(url.pathname==='/config')return json(env,{googleClientId:env.GOOGLE_CLIENT_ID});
  if(url.pathname==='/auth/login'){
    const state=crypto.randomUUID(), redirectUri=`${url.origin}/auth/callback`, authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorize.searchParams.set('client_id',env.GOOGLE_CLIENT_ID); authorize.searchParams.set('redirect_uri',redirectUri); authorize.searchParams.set('response_type','code'); authorize.searchParams.set('scope','openid email profile'); authorize.searchParams.set('state',state); authorize.searchParams.set('prompt','select_account');
    return new Response(null,{status:302,headers:{Location:authorize.toString(),'Set-Cookie':`oauth_state=${state}; Max-Age=600; Path=/auth/callback; HttpOnly; Secure; SameSite=Lax`,'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/auth/callback'){
    const expected=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('oauth_state='))?.slice(12), state=url.searchParams.get('state'), code=url.searchParams.get('code');
    if(!expected||!state||expected!==state||!code)return new Response('Invalid OAuth callback.',{status:400});
    const redirectUri=`${url.origin}/auth/callback`, tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code'})}), tokens=await tokenResponse.json();
    if(!tokenResponse.ok||!tokens.id_token)return new Response('Google authentication failed.',{status:401});
    const verify=await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`), profile=await verify.json(), allowed=(env.ALLOWED_EMAILS||'').toLowerCase().split(',').map(x=>x.trim()), email=(profile.email||'').toLowerCase();
    if(!verify.ok||profile.aud!==env.GOOGLE_CLIENT_ID||profile.email_verified!=='true'||!allowed.includes(email))return new Response('This Google account is not authorized.',{status:403});
    const token=await issue(email,env);
    return new Response(null,{status:302,headers:{Location:`${env.ALLOWED_ORIGIN}/lester-apps-public/`,'Set-Cookie':`lester_session=${token}; Max-Age=${env.SESSION_TTL_SECONDS||86400}; Path=/; HttpOnly; Secure; SameSite=None`,'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/auth/google'&&request.method==='POST'){
    const {credential}=await request.json();
    const verify=await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential||'')}`), profile=await verify.json();
    const allowed=(env.ALLOWED_EMAILS||'').toLowerCase().split(',').map(x=>x.trim());
    if(!verify.ok||profile.aud!==env.GOOGLE_CLIENT_ID||profile.email_verified!=='true'||!allowed.includes((profile.email||'').toLowerCase()))return json(env,{error:'This Google account is not authorized.'},403);
    const token=await issue(profile.email.toLowerCase(),env);
    return json(env,{user:{email:profile.email.toLowerCase()}},200,{'Set-Cookie':`lester_session=${token}; Max-Age=${env.SESSION_TTL_SECONDS||86400}; Path=/; HttpOnly; Secure; SameSite=None`});
  }
  if(url.pathname==='/auth/logout'&&request.method==='POST')return json(env,{ok:true},200,{'Set-Cookie':'lester_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None'});
  const claims=await session(request,env); if(!claims)return json(env,{error:'Authentication required'},401);
  if(url.pathname==='/auth/session')return json(env,{user:{email:claims.sub}});
  const match=url.pathname.match(/^\/api\/(dashboard|finance|school|job|life)$/); if(!match||!APPS.has(match[1]))return json(env,{error:'Not found'},404);
  const target=env[`APP_${match[1].toUpperCase()}_URL`]; if(!target)return json(env,{error:`${match[1]} endpoint is not configured`},503);
  const upstream=new URL(target); upstream.searchParams.set('endpoint','summary'); if(env.APP_SHARED_TOKEN)upstream.searchParams.set('token',env.APP_SHARED_TOKEN);
  const response=await fetch(upstream,{headers:{Accept:'application/json'}}); if(!response.ok)return json(env,{error:'Upstream application request failed'},502);
  const contentType=response.headers.get('Content-Type')||'', body=await response.text();
  if(!contentType.toLowerCase().includes('application/json'))return json(env,{error:'Apps Script API deployment requires configuration'},502);
  try { JSON.parse(body); } catch { return json(env,{error:'Apps Script API returned invalid JSON'},502); }
  return new Response(body,{status:200,headers:cors(env,{'Content-Type':'application/json; charset=utf-8'})});
}};
