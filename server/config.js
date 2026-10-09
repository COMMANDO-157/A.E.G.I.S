import {fail} from './policy.js';
export const production=env=>env.NODE_ENV==='production'||Boolean(env.VERCEL);
const local=host=>['localhost','127.0.0.1','[::1]'].includes(host);
export function appOrigin(env=process.env) {
 let url;try{url=new URL(env.APP_ORIGIN);}catch{fail(503,'APP_ORIGIN must be a valid origin.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash) fail(503,'APP_ORIGIN must contain only scheme, host and port.');
 if(url.protocol!=='https:'&&(production(env)||!local(url.hostname))) fail(503,'APP_ORIGIN requires HTTPS outside local development.');
 return url.origin;
}
export function databaseOptions(env=process.env) {
 let url;try{url=new URL(env.DATABASE_URL);}catch{fail(503,'DATABASE_URL is not configured correctly.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname) fail(503,'DATABASE_URL must use PostgreSQL.');
 if(env.DATABASE_SSL!==undefined&&!['true','false'].includes(env.DATABASE_SSL)) fail(503,'Invalid DATABASE_SSL setting.');
 const plain=env.DATABASE_SSL==='false';
 if(plain&&(production(env)||!local(url.hostname))) fail(503,'Unencrypted PostgreSQL is allowed only for local development.');
 // pg URL SSL parameters can override explicit certificate validation.
 for(const key of [...url.searchParams.keys()]) if(key.toLowerCase().startsWith('ssl')) url.searchParams.delete(key);
 if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0') fail(503,'TLS certificate verification must remain enabled.');
 return {connectionString:url.toString(),ssl:plain?false:{rejectUnauthorized:true}};
}
export function configured(env=process.env) {
 try {appOrigin(env);databaseOptions(env);return /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||'');}catch{return false;}
}
export const intakeEnabled=(env=process.env)=>!production(env)&&env.LIVE_INTAKE_ENABLED==='true'&&configured(env);
