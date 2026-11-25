import test from 'node:test';
import assert from 'node:assert/strict';
import {backend} from './helpers/backend.mjs';

test('configured Brevo mail uses its API and does not call MailApp',()=>{
 const b=backend('e@company.test');b.properties.BREVO_API_KEY='brevo-test-key';b.properties.BREVO_SENDER_EMAIL='sender@example.test';
 let request,mailCalls=0;
 b.ctx.UrlFetchApp={fetch:(url,options)=>{request={url,options};return {getResponseCode:()=>201};}};
 b.ctx.MailApp={sendEmail:()=>mailCalls++};
 b.ctx.sendMail_({to:'recipient@example.test',subject:'Test subject',body:'Test body',name:'TeamPulse'});
 assert.equal(request.url,'https://api.brevo.com/v3/smtp/email');
 assert.equal(request.options.headers['api-key'],'brevo-test-key');
 assert.equal(request.options.headers.accept,'application/json');
 assert.equal(mailCalls,0);
});
