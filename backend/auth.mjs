import {createHash,timingSafeEqual} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest();
export function authenticated(value,env){
 if(!env.LAKON_USERNAME||!env.LAKON_PASSWORD||!/^Basic /i.test(value||''))return false;
 let decoded;try{decoded=Buffer.from(value.slice(6),'base64').toString('utf8')}catch{return false}
 return timingSafeEqual(hash(decoded),hash(env.LAKON_USERNAME+':'+env.LAKON_PASSWORD));
}
