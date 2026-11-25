import nodemailer from 'nodemailer';

const recipient=process.argv[2];
if(!recipient||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)){
 console.error('Usage: npm run test:email -- <recipient@example.com>');
 process.exitCode=1;
}else{
 const port=Number(process.env.SMTP_PORT);
 const required=['SMTP_HOST','SMTP_USER','SMTP_PASS','MAIL_FROM'];
 const missing=required.filter(key=>!process.env[key]);
 if(!Number.isInteger(port)||port!==587)missing.push('SMTP_PORT=587');
 if(missing.length){
  console.error('Missing or invalid email configuration: '+missing.join(', '));
  process.exitCode=1;
 }else{
  const transport=nodemailer.createTransport({
   host:process.env.SMTP_HOST,
   port,
   secure:false,
   requireTLS:true,
   auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });
  try{
   const result=await transport.sendMail({
    from:{name:'TeamPulse',address:process.env.MAIL_FROM},
    to:recipient,
    subject:'TeamPulse SMTP configuration test',
    text:'This is a test email confirming the TeamPulse SMTP connection is working.'
   });
   console.log('Test email sent. Message ID: '+result.messageId);
  }catch(error){
   const detail=[error.code,error.responseCode,error.response,error.message].filter(Boolean).join(' | ').split(process.env.SMTP_PASS).join('[redacted]');
   console.error('SMTP test email failed:',detail);
   process.exitCode=1;
  }finally{
   transport.close();
  }
 }
}
