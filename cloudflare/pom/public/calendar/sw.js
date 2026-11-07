// POM calendar push receiver: runs while the home screen app is closed.
self.addEventListener('push', event=>{
  let message={};
  try{if(event.data)message=event.data.json();}catch{}
  const title=String(message.title||'POM 이번 주 일정').slice(0,140);
  const body=String(message.body||'이번 주 일정을 확인해 줘.').slice(0,1200);
  event.waitUntil(self.registration.showNotification(title,{
    body,tag:String(message.tag||'pom-weekly'),
    icon:'/calendar/apple-icon.png',
    badge:'/calendar/apple-icon.png',
    data:{url:'/calendar/?briefing=weekly'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL('/calendar/?briefing=weekly',self.location.origin).href;
  event.waitUntil((async()=>{
    const pages=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const page of pages){
      if(page.url.startsWith(self.location.origin+'/calendar')){
        await page.focus();
        if('navigate' in page)await page.navigate(target);
        return;
      }
    }
    if(clients.openWindow)await clients.openWindow(target);
  })());
});