import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isPhoneInput, nameError, emailError, passwordError, validateProfile, validatePassword, isValidDate, pktToUtc, dateRangeError, validateAvailability, validateSettings, validateReason, Availability } from '../packages/core/src/index';

test('Pakistan mobile and landline inputs normalize to +92, including Urdu digits',()=>{
 for(const input of ['03001234567','+92 300 1234567','0092-300-1234567','923001234567','۰۳۰۰۱۲۳۴۵۶۷','٠٣٠٠١٢٣٤٥٦٧']) assert.equal(normalizePhone(input),'+923001234567',input);
 for(const input of ['02134567890','+92 (21) 34567890','00922134567890']) assert.equal(normalizePhone(input),'+922134567890',input);
 assert.equal(normalizePhone('0512345678'),'+92512345678');
});
test('phone input rejects alphabetic typing/paste and invalid or foreign numbers',()=>{
 for(const input of ['abc','0300abc1234567','03001234567 ext 2','+14155552671','+447911123456','0300123456','030012345678','03991234567','123','', '080012345','3001234567']) assert.equal(normalizePhone(input),null,input);
 for(const input of ['abc','0300abc1234567','+92+300','123\n456']) assert.equal(isPhoneInput(input),false,input);
 assert.equal(isPhoneInput('+92 (300) 123-4567'),true);
});
test('names support English and Urdu; profile validation trims and normalizes',()=>{
 for(const name of ['Ayesha Khan','محمد علی',"O’Neil",'Ali-Raza','Élodie']) assert.equal(nameError(name),'');
 for(const name of [' ','123','Ali123','<script>','a'.repeat(121)]) assert.ok(nameError(name));
 assert.deepEqual(validateProfile(' Ayesha Khan ','03001234567'),{name:'Ayesha Khan',phone:'+923001234567'});
});
test('email and new password checks give errors without altering passwords',()=>{
 for(const email of ['you@example.com',' user+label@example.com ','a.b@example.org.pk']) assert.equal(emailError(email),'');
 for(const email of ['','a@','a@b','a..b@example.com','.a@example.com','a@-example.com','a @example.com','a@example..com']) assert.ok(emailError(email),email);
 assert.equal(passwordError(' pass word '),'');
 for(const password of ['short','        ','a'.repeat(73),'😀'.repeat(19),'abcd\0efgh']) assert.ok(passwordError(password));
 assert.throws(()=>validatePassword('long password','different'),/match/);
});
test('date and time validation rejects normalized invalid calendar dates and reversed filters',()=>{
 for(const value of ['2026-02-30','2026-02-29','2026-13-01','','0000-01-01']) assert.equal(isValidDate(value),false);
 assert.equal(isValidDate('2028-02-29'),true);
 for(const time of ['24:00','09:60','9:00','09:00:30']) assert.throws(()=>pktToUtc('2026-10-26',time));
 assert.equal(pktToUtc('2026-10-26','09:00:00'),'2026-10-26T04:00:00.000Z');
 assert.ok(dateRangeError('2026-10-27','2026-10-26'));assert.equal(dateRangeError('',''),'');
});
test('availability rejects incomplete scope, duplicate dates, and malformed hours',()=>{
 const rules:Availability[]=Array.from({length:7},(_,weekday)=>({weekday,is_workday:true,start_local:'09:00',end_local:'17:00'}));
 assert.doesNotThrow(()=>validateAvailability(rules,[],[]));
 assert.throws(()=>validateAvailability(rules.slice(1),[],[]));
 assert.throws(()=>validateAvailability(rules,[{weekday:null,local_date:'',start_local:'13:00',end_local:'14:00'}],[]));
 assert.throws(()=>validateAvailability(rules,[{weekday:1,local_date:null,start_local:'24:00',end_local:'14:00'}],[]));
 const block={local_date:'2026-10-26',type:'holiday' as const,description:''};
 assert.throws(()=>validateAvailability(rules,[],[block,block]));
 assert.throws(()=>validateAvailability(rules,[],[{...block,description:'a'.repeat(501)}]));
});
test('settings and free-text limits reject decimals, missing numbers and excessive reasons',()=>{
 for(const duration of [NaN,0,-1,1.5,1441]) assert.throws(()=>validateSettings(duration,0));
 for(const retention of [NaN,-1,1.5,2147483648]) assert.throws(()=>validateSettings(30,retention));
 assert.doesNotThrow(()=>validateSettings(30,0));
 assert.throws(()=>validateReason(' ',true));assert.throws(()=>validateReason('a'.repeat(2001)));assert.doesNotThrow(()=>validateReason(''));
});
