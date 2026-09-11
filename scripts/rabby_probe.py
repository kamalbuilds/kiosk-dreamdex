"""Run inside bh-multi: print 'x,y,enabled' of the Rabby confirm button in screen points."""
exec(open('/Users/kamal/Developer/browser-harness/wallet_control.py').read())
tid = find_approval(timeout=8)
if not tid:
    print('NONE')
else:
    switch_tab(tid)
    off = js("innerWidth+','+innerHeight+','+screenX+','+screenY+','+(outerHeight||800)")
    rect = js("(function(){var bs=document.querySelectorAll('button');var want=['Confirm','Sign','Approve','Continue','Sign and Send'];for(var k=0;k<want.length;k++){for(var i=0;i<bs.length;i++){var t=(bs[i].textContent||'').trim();if(t===want[k]){var r=bs[i].getBoundingClientRect();return Math.round(r.left+r.width/2)+','+Math.round(r.top+r.height/2)+','+(bs[i].disabled?0:1)+','+t}}}return 'none'})()")
    print('OK', off, rect)
