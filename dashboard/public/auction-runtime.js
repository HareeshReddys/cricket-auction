/* Transport adapter for the original auction workflow. Server is the source of truth. */
var tournamentId=new URLSearchParams(location.search).get('t'),apiRoot='/api/tournaments/'+tournamentId;
var backend=sessionStorage.getItem('boundary_api_url')||'';SCRIPT_URL=apiRoot+'/legacy';
function isPhotoURL(s){return typeof s==='string'&&(s.startsWith('https://')||s.startsWith('http://127.0.0.1:')||s.startsWith('/api/assets/'))}
if(!sessionStorage.getItem('boundary_session'))top.location.href='./#/login?returnTo='+encodeURIComponent('/auction/'+tournamentId);

var serverRevision=0,serverVersion=-1,mutationPending=false,fetchPending=false,currentTournament=null;
function escJs(s){return String(s||'').replace(/[\\'"<>&\r\n]/g,function(c){return '\\x'+c.charCodeAt(0).toString(16).padStart(2,'0')});}
function csvSafe(v){var s=String(v==null?'':v);return /^[=+@\-\t\r]/.test(s)?"'"+s:s;}
async function call(path,body){var r=await fetch(backend+path,{cache:'no-store',headers:{Authorization:'Bearer '+sessionStorage.getItem('boundary_session')},...(body?{method:'POST',headers:{Authorization:'Bearer '+sessionStorage.getItem('boundary_session'),'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});var d=await r.json();if(!r.ok||d.success===false)throw new Error(d.error||'Request failed');return d;}
function indicate(message,error){document.getElementById('saveIndicator').textContent=message;document.getElementById('saveIndicator').style.color=error?'#fca5a5':'#d2ed85';}
function failure(e){var el=document.getElementById('persistentError');el.hidden=false;el.textContent=e.message+' ';var btn=document.createElement('button');btn.textContent='Refresh';btn.onclick=function(){loadData()};el.appendChild(btn);indicate('Changes not saved',true);}
function renderEverything(){updateAll();renderTeamSetup();renderPlayerSetup();renderStartHint();renderAuction();renderTeams();renderUnsold();document.querySelectorAll('img').forEach(function(i){i.loading='lazy'})}
async function snapshot(){
 var d=await call(apiRoot+'/snapshot');currentTournament=d.tournament;serverRevision=d.revision;serverVersion=d.tournament.version;allPlayers=d.players.slice().reverse();teams=d.teams;auctPlayers=[];mergeAuctState(d.auctState);
 document.title=currentTournament.name+' · Boundary';document.getElementById('tournamentName').textContent=currentTournament.name;
 document.getElementById('registrationLink').href='./#/register/'+tournamentId;
 var base=document.getElementById('defBase');if(base&&!base.dataset.configured){base.value=currentTournament.settings.basePrice;base.dataset.configured='true'}
 var budget=document.getElementById('tBudget');if(budget&&!budget.dataset.configured){budget.value=currentTournament.settings.teamBudget;budget.dataset.configured='true'}
 autoSyncVerified();document.getElementById('app').style.display='block';sessionStorage.setItem('boundary_snapshot_'+tournamentId,JSON.stringify(d));renderEverything();
 indicate(currentTournament.settings.archived?'Archived · read only':'All changes saved');document.getElementById('persistentError').hidden=true;
}
loadAuctionState=function(){};clearAuctionState=function(){};
updateAll=function(){autoSyncVerified();updateStats();renderTable();renderRecent();updateBadges()};
doLogin=function(){loadData()};
loadData=async function(){if(mutationPending||fetchPending)return;fetchPending=true;try{await snapshot()}catch(e){failure(e);if(!allPlayers.length)restoreSnapshot()}finally{fetchPending=false}};
fetchAllPlayers=async function(){var d=await call(SCRIPT_URL+'?action=getAll');return d.data};
loadAuctionFromSheet=function(){return loadData()};
hardReset=function(){loadData()};
async function mutate(action,body){
 if(mutationPending||fetchPending){notify('Please wait for the current request.');return false}
 mutationPending=true;document.getElementById('saveBlocker').hidden=false;indicate('Saving…');
 try{await call(SCRIPT_URL,Object.assign({action:action},body));await snapshot();return true}
 catch(e){hideSoldCelebration();document.getElementById('unsoldStamp').style.display='none';try{await snapshot()}catch(_){}failure(e);return false}
 finally{mutationPending=false;document.getElementById('saveBlocker').hidden=true}
}
saveAuctionToSheet=function(t,a){return mutate('saveAuction',{teams:t,auctState:a,revision:serverRevision})};
saveAuctionState=function(){return saveAuctionToSheet(teams,auctPlayers.map(function(p){return {id:p.id,basePrice:p.basePrice,status:p.status,soldTo:p.soldTo,soldPrice:p.soldPrice,isFree:p.isFree||false,comment:p.comment||''}}))};
doStatus=async function(id,status,reason){await mutate('updateStatus',{regId:id,status:status,reason:reason||''})};
confirmReject=function(){var id=rejectTarget,reason=document.getElementById('rejectReason').value.trim();closeM('rejectModal');rejectTarget=null;if(id)doStatus(id,'Rejected',reason)};
confirmDelete=async function(){var id=deleteTarget;closeDel();deleteTarget=null;if(id)await mutate('deletePlayer',{regId:id})};
resetFullAuction=async function(){if(confirm('Reset teams and auction results for this tournament? Registrations will be kept.'))await saveAuctionToSheet([],[])};
setBase=function(id,val){var base=Number(val);if(!Number.isSafeInteger(base)||base<0){notify('Enter a valid base price');return}auctPlayers=auctPlayers.map(function(p){return p.id===id?Object.assign({},p,{basePrice:base}):p});saveAuctionState()};
applyAllBase=function(){var base=Number(document.getElementById('defBase').value);if(!Number.isSafeInteger(base)||base<0)return;auctPlayers=auctPlayers.map(function(p){return p.status==='pending'?Object.assign({},p,{basePrice:base}):p});saveAuctionState()};
loadPlayers=async function(){await loadData();document.getElementById('loadMsg').style.display='block';document.getElementById('loadMsg').textContent='Verified registrations are added automatically.'};
removeTeam=function(id){if(auctPlayers.some(function(p){return p.soldTo===id})){notify('Reset the team’s sold players before removing it.');return}teams=teams.filter(function(t){return t.id!==id});saveAuctionState()};
importTeams=async function(){var code=prompt('Paste the teams code from this tournament:');if(!code)return;try{var d=JSON.parse(decodeURIComponent(escape(atob(code.trim()))));await saveAuctionToSheet(d.teams,d.auctState||[])}catch(e){failure(new Error('Invalid team import code.'))}};
var originalFreeAdd=confirmFreeAdd;
confirmFreeAdd=function(){var team=teams.find(function(t){return t.id===document.getElementById('freeAddTeamId').value});var n=Number(document.getElementById('freeAmount').value);if(!team||!Number.isSafeInteger(n)||n<0||n>team.budget){notify('Enter an amount within the team budget.');return}originalFreeAdd()};
var originalAssign=assignTeam;
assignTeam=function(id){var p=Number(document.getElementById('bidInp').value),t=teams.find(function(t){return t.id===id});if(!bidPlayer||!t||!Number.isSafeInteger(p)||p<bidPlayer.basePrice||p>t.budget){notify('Bid must meet the base price and team budget.');return}originalAssign(id)};
// Poll only a tiny version response. Do not disrupt an active bid or form.
setInterval(async function(){if(document.visibilityState!=='visible'||mutationPending||fetchPending||document.querySelector('.overlay.open')||document.activeElement?.matches('input,textarea,select'))return;try{var d=await call(apiRoot+'/version');if(d.version!==serverVersion)await loadData()}catch(e){indicate('Connection interrupted · retrying',true)}},3000);
window.addEventListener('beforeunload',function(e){if(mutationPending){e.preventDefault();e.returnValue=''}});
loadData();

function restoreSnapshot(){try{var d=JSON.parse(sessionStorage.getItem('boundary_snapshot_'+tournamentId)||'null');if(!d)return;allPlayers=d.players;teams=d.teams;auctPlayers=[];mergeAuctState(d.auctState);document.getElementById('app').style.display='block';renderEverything();indicate('Offline · cached player list · edits disabled',true);document.getElementById('saveBlocker').hidden=false;document.querySelector('#saveBlocker>div').textContent='Offline — reconnect before editing auction data';}catch(_){}}
var originalOpenPhoto=openPhoto;
openPhoto=function(src,name,valid){var p=allPlayers.find(function(p){return p.PhotoURL===src||p.PhotoThumbURL===src});return originalOpenPhoto(p?p.PhotoURL:src,name,valid)};
function previewURL(src){var p=allPlayers.find(function(p){return p.PhotoURL===src});return p&&p.PhotoThumbURL?p.PhotoThumbURL:src;}
