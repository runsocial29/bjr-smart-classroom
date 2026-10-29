
const CFG_KEY="bjr_v4_cfg", PUBLIC_URL_KEY="bjr_v4_public_url";
// V5.5.6: เชื่อมต่อ Supabase อัตโนมัติสำหรับครูและนักเรียนทุกอุปกรณ์
// ใช้เฉพาะ Publishable key ซึ่งออกแบบมาสำหรับ client-side application
const DEFAULT_SUPABASE_CONFIG=Object.freeze({
  url:"https://isivzkduwhvbnufsrdue.supabase.co",
  key:"sb_publishable_4OKXjLwU3UGn09eN0tsxkw_wVrfgm87"
});
let cfg={...DEFAULT_SUPABASE_CONFIG};
let sb=null,user=null,rooms=[],currentRoomId=null,currentSubject="",students=[],works=[],attendance={},attendanceNotes={},attendanceHistory=[],behavior={},scores={},examScores={},currentWorkId=null,randomHistory=[],attendanceDate="",attendancePeriod=null;
const TERM_KEY="bjr_smart_classroom_term_v560";
const YEAR_OPTIONS_KEY="bjr_smart_classroom_year_options_v560";
let academicYearOptions=(()=>{try{const v=JSON.parse(localStorage.getItem(YEAR_OPTIONS_KEY)||"null");return Array.isArray(v)&&v.length?[...new Set(v.map(Number).filter(n=>Number.isInteger(n)&&n>=2500))].sort((a,b)=>a-b):[2569,2570,2571,2572,2573,2574]}catch{return [2569,2570,2571,2572,2573,2574]}})();
const savedTerm=(()=>{try{return JSON.parse(localStorage.getItem(TERM_KEY)||"{}")}catch{return {}}})();
let academicYear=Number(savedTerm.year)||2569, semester=Number(savedTerm.semester)||2;
function termLabel(){return `ปีการศึกษา ${academicYear} • ภาคเรียนที่ ${semester}`}
function termFilters(q){return q.eq("academic_year",academicYear).eq("semester",semester)}
function persistTerm(){localStorage.setItem(TERM_KEY,JSON.stringify({year:academicYear,semester}))}
function initTermControls(){
  const y=$("#academicYearSelect"), sem=$("#semesterSelect");
  if(!y||!sem)return;
  if(!academicYearOptions.includes(academicYear)){academicYearOptions.push(academicYear);academicYearOptions.sort((a,b)=>a-b);}
  y.innerHTML=academicYearOptions.map(n=>`<option value="${n}">ปีการศึกษา ${n}</option>`).join("");
  y.value=String(academicYear);sem.value=String(semester);
  y.onchange=()=>{if(hasUnsavedScores()&&!confirmDiscardUnsavedScores()){y.value=String(academicYear);return;}academicYear=Number(y.value);persistTerm();clearWorkScoresDirty();clearExamScoresDirty();loadRoomData();};
  sem.onchange=()=>{if(hasUnsavedScores()&&!confirmDiscardUnsavedScores()){sem.value=String(semester);return;}semester=Number(sem.value);persistTerm();clearWorkScoresDirty();clearExamScoresDirty();loadRoomData();};
  $("#addAcademicYearBtn").onclick=()=>{
    const raw=prompt("กรอกปีการศึกษา พ.ศ. ที่ต้องการเพิ่ม เช่น 2575",String(Math.max(...academicYearOptions)+1));
    if(raw===null)return;
    const next=Number(raw.trim());
    if(!Number.isInteger(next)||next<2500||next>3000)return alert("กรุณากรอกปีการศึกษาเป็นตัวเลข พ.ศ. เช่น 2575");
    if(!academicYearOptions.includes(next))academicYearOptions.push(next);
    academicYearOptions.sort((a,b)=>a-b);localStorage.setItem(YEAR_OPTIONS_KEY,JSON.stringify(academicYearOptions));
    y.innerHTML=academicYearOptions.map(n=>`<option value="${n}">ปีการศึกษา ${n}</option>`).join("");
    if(hasUnsavedScores()&&!confirmDiscardUnsavedScores()){y.value=String(academicYear);return;}
    academicYear=next;y.value=String(next);persistTerm();clearWorkScoresDirty();clearExamScoresDirty();loadRoomData();toast(`เพิ่มปีการศึกษา ${next} แล้ว`);
  };
  $("#startTermBtn").onclick=async()=>{
    if(hasUnsavedScores()&&!confirmDiscardUnsavedScores())return;
    if(!confirm(`เปิดพื้นที่ข้อมูล ${termLabel()} ใช่หรือไม่?\n\nข้อมูลเดิมจะไม่ถูกลบ และข้อมูลคะแนน/งาน/การเข้าเรียนจะถูกแยกตามภาคเรียน`))return;
    clearWorkScoresDirty();clearExamScoresDirty();persistTerm();await loadRoomData();toast(`เปิด ${termLabel()} แล้ว`);
  };
}

let unsavedWorkScores=false, unsavedExamScores=false;
function hasUnsavedScores(){return unsavedWorkScores||unsavedExamScores}
function confirmDiscardUnsavedScores(){
  if(!hasUnsavedScores())return true;
  return window.confirm("⚠️ พบคะแนนที่กรอกแล้วแต่ยังไม่ได้บันทึก\n\nกด “ยกเลิก” เพื่อกลับไปกดบันทึกคะแนนก่อน\nกด “ตกลง” หากต้องการออกโดยไม่บันทึก");
}
function markWorkScoresDirty(){unsavedWorkScores=true}
function markExamScoresDirty(){unsavedExamScores=true}
function clearWorkScoresDirty(){unsavedWorkScores=false}
function clearExamScoresDirty(){unsavedExamScores=false}
window.addEventListener("beforeunload",e=>{
  if(!hasUnsavedScores())return;
  e.preventDefault();
  e.returnValue="";
});

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)};
const savePopup=m=>window.alert(`✅ ${m}`);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuid=()=>crypto.randomUUID();
const today=()=>{
  const d=new Date();
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const num=v=>v==null||v===""?0:Number(v);
function courseworkTotal(studentId){return works.reduce((sum,w)=>sum+num(scores[w.id]?.[studentId]),0)}
function missingWorkCount(studentId){
  return works.reduce((n,w)=>{
    const row=scores[w.id]||{};
    return n+(Object.prototype.hasOwnProperty.call(row,studentId)?0:1);
  },0);
}
function missingWorkCountFromAssignments(list){
  return (list||[]).filter(a=>a.score===null||a.score===undefined||a.score==="").length;
}
function missingWorkNames(studentId){
  return works.filter(w=>!Object.prototype.hasOwnProperty.call(scores[w.id]||{},studentId)).map(w=>w.name);
}
function gradeFromTotal(total){
  const n=Number(total)||0;
  if(n>=80)return 4; if(n>=75)return 3.5; if(n>=70)return 3; if(n>=65)return 2.5;
  if(n>=60)return 2; if(n>=55)return 1.5; if(n>=50)return 1; return 0;
}
function courseworkRounded(studentId){return courseworkExcelValue(courseworkTotal(studentId))}
function studentGrandTotal(studentId){const e=examScores[studentId]||{};return courseworkRounded(studentId)+num(e.midterm)+num(e.final)}

function initClient(){
  if(!cfg?.url||!cfg?.key||!window.supabase?.createClient)return false;
  try{
    sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return true;
  }catch(e){
    console.error("Supabase init failed",e);
    return false;
  }
}
function showOnly(id){["setupPage","authPage","studentLoginPage","studentPage","teacherApp"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id));}
function publicBase(){return (localStorage.getItem(PUBLIC_URL_KEY)||location.href.split("?")[0]).trim();}
function studentToken(){return new URLSearchParams(location.search).get("student");}
function isStudentCodePortal(){return new URLSearchParams(location.search).get("portal")==="1";}
function portalOwner(){return new URLSearchParams(location.search).get("owner")||"";}

const initialStudentParams=new URLSearchParams(location.search);
let studentViewYear=Number(initialStudentParams.get("year"))||2569;
let studentViewSemester=Number(initialStudentParams.get("semester"))||2;
let studentLookup=null;
let studentPortalBusy=false;
function initStudentTermSelectors(){
  const yearIds=["studentLoginYearSelect","studentYearSelect"];
  yearIds.forEach(id=>{const el=$("#"+id);if(!el)return;el.innerHTML=[2569,2570,2571,2572,2573,2574].map(y=>`<option value="${y}">${y}</option>`).join("");el.value=String(studentViewYear);});
  const semesterIds=["studentLoginSemesterSelect","studentSemesterSelect"];
  semesterIds.forEach(id=>{const el=$("#"+id);if(el)el.value=String(studentViewSemester);});
  ["studentLoginYearSelect","studentYearSelect"].forEach(id=>{const el=$("#"+id);if(el)el.onchange=()=>{studentViewYear=Number(el.value)||2569;syncStudentTermSelectors();if(!$("#studentPage").classList.contains("hidden"))refreshStudentScores();};});
  ["studentLoginSemesterSelect","studentSemesterSelect"].forEach(id=>{const el=$("#"+id);if(el)el.onchange=()=>{studentViewSemester=Number(el.value)||2;syncStudentTermSelectors();if(!$("#studentPage").classList.contains("hidden"))refreshStudentScores();};});
}
function syncStudentTermSelectors(){
  ["studentLoginYearSelect","studentYearSelect"].forEach(id=>{const el=$("#"+id);if(el)el.value=String(studentViewYear);});
  ["studentLoginSemesterSelect","studentSemesterSelect"].forEach(id=>{const el=$("#"+id);if(el)el.value=String(studentViewSemester);});
}
async function refreshStudentScores(){
  if(studentPortalBusy)return;
  if(studentToken()){await loadStudentPortal(studentToken(),studentViewYear,studentViewSemester);return;}
  if(studentLookup){await loadStudentByCode(studentLookup.code,studentLookup.owner,studentViewYear,studentViewSemester);}
}

async function boot(){
  if(!attendanceDate)attendanceDate=today();
  initTermControls();
  $("#todayText").textContent=new Intl.DateTimeFormat("th-TH",{dateStyle:"full"}).format(new Date());
  setInterval(()=>$("#clock").textContent=new Date().toLocaleTimeString("th-TH"),1000);
  if(!initClient()){
    showOnly("setupPage");
    const note=$("#setupStatus");
    if(note)note.textContent="เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่";
    return;
  }
  initStudentTermSelectors();
  if(studentToken()){showOnly("studentPage");await loadStudentPortal(studentToken());return;}
  if(isStudentCodePortal()){showOnly("studentLoginPage");return;}
  const {data:{session}}=await sb.auth.getSession();
  if(!session){showOnly("authPage");return;}
  user=session.user;showOnly("teacherApp");await loadRooms();
}

$("#saveSetup").onclick=()=>location.reload();
$("#backToSetup").onclick=()=>location.reload();
$("#signInBtn").onclick=async()=>{
  const btn=$("#signInBtn"), msg=$("#authMsg");
  msg.textContent="";
  const email=$("#authEmail").value.trim(), password=$("#authPassword").value;
  if(!email){msg.textContent="กรุณากรอกอีเมล";return;}
  if(password.length<6){msg.textContent="รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";return;}
  if(!sb?.auth){msg.textContent="ยังเชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่";return;}
  btn.disabled=true; btn.textContent="กำลังเข้าสู่ระบบ...";
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error)throw error;
    user=data.user;showOnly("teacherApp");await loadRooms();
  }catch(e){
    msg.textContent="เข้าสู่ระบบไม่สำเร็จ: "+(e?.message||e);
  }finally{
    btn.disabled=false; btn.textContent="เข้าสู่ระบบ";
  }
};

$("#signUpBtn").onclick=async()=>{
  const btn=$("#signUpBtn"), msg=$("#authMsg");
  msg.textContent="";
  const email=$("#authEmail").value.trim(), password=$("#authPassword").value;
  if(!email){msg.textContent="กรุณากรอกอีเมลก่อนสมัคร";return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg.textContent="รูปแบบอีเมลไม่ถูกต้อง";return;}
  if(password.length<6){msg.textContent="รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";return;}
  if(!sb?.auth){msg.textContent="ยังเชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่";return;}

  btn.disabled=true; btn.textContent="กำลังสมัคร...";
  msg.textContent="กำลังส่งข้อมูลสมัครบัญชีไปยัง Supabase...";
  try{
    const signupPromise=sb.auth.signUp({email,password});
    const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error("เชื่อมต่อ Supabase ใช้เวลานานเกินไป กรุณาตรวจอินเทอร์เน็ตหรือ Project URL / Key")),15000));
    const {data,error}=await Promise.race([signupPromise,timeoutPromise]);
    if(error)throw error;
    msg.textContent=data.session
      ?"สมัครสำเร็จ กำลังเข้าสู่ระบบ..."
      :"สมัครสำเร็จแล้ว กรุณาเปิดอีเมลเพื่อยืนยันบัญชี แล้วกลับมากด “เข้าสู่ระบบ”";
    if(data.session){user=data.user;showOnly("teacherApp");await loadRooms();}
  }catch(e){
    msg.textContent="สมัครบัญชีไม่สำเร็จ: "+(e?.message||e);
  }finally{
    btn.disabled=false; btn.textContent="สมัครบัญชีครู";
  }
};
$("#logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload()};

async function loadStudentByCode(code,owner,year=studentViewYear,term=studentViewSemester){
  const msg=$("#studentCodeLoginMsg");
  if(studentPortalBusy)return;
  studentPortalBusy=true;
  const btn=$("#studentCodeLoginBtn");
  if(btn){btn.disabled=true;btn.textContent="กำลังค้นหา...";}
  $("#spError").textContent="";
  try{
    const {data,error}=await sb.rpc("student_portal_by_code",{p_owner_id:owner,p_student_code:code,p_academic_year:year,p_semester:term});
    if(error)throw error;
    const x=Array.isArray(data)?data[0]:data;
    if(!x||!x.student)throw new Error("ไม่พบรหัสนักเรียนนี้ในปีการศึกษาและภาคเรียนที่เลือก");
    studentLookup={code,owner};studentViewYear=year;studentViewSemester=term;syncStudentTermSelectors();
    showOnly("studentPage");renderStudentPortalData(x);
    const notice=$("#studentTermNotice");if(notice)notice.textContent=`กำลังแสดงคะแนนปีการศึกษา ${year} ภาคเรียนที่ ${term}`;
  }catch(e){
    const message=e?.message||String(e);
    if(!$("#studentPage").classList.contains("hidden"))$("#spError").textContent=message;
    else if(msg)msg.textContent=message;
  }
  finally{studentPortalBusy=false;if(btn){btn.disabled=false;btn.textContent="ดูคะแนนของฉัน";}}
}
$("#studentCodeLoginBtn").onclick=async()=>{
  const code=$("#studentCodeLogin").value.trim(), owner=portalOwner(), msg=$("#studentCodeLoginMsg");
  msg.textContent="";
  if(!owner){msg.textContent="ลิงก์ตรวจคะแนนไม่สมบูรณ์ กรุณาขอลิงก์ใหม่จากครู";return;}
  if(!code){msg.textContent="กรุณากรอกรหัสนักเรียน";return;}
  studentViewYear=Number($("#studentLoginYearSelect")?.value)||studentViewYear;
  studentViewSemester=Number($("#studentLoginSemesterSelect")?.value)||studentViewSemester;
  syncStudentTermSelectors();
  await loadStudentByCode(code,owner,studentViewYear,studentViewSemester);
};
$("#studentCodeLogin")?.addEventListener("keydown",e=>{if(e.key==="Enter")$("#studentCodeLoginBtn").click();});


$$(".nav").forEach(b=>b.dataset.view&&(b.onclick=()=>{
  const activeView=$(".view.active")?.id||"";
  if(activeView==="scores" && b.dataset.view!=="scores" && !confirmDiscardUnsavedScores())return;
  if(activeView==="scores" && b.dataset.view!=="scores"){clearWorkScoresDirty();clearExamScoresDirty();}
  setView(b.dataset.view);
}));
function setView(v){
  $$(".view").forEach(x=>x.classList.toggle("active",x.id===v));
  $$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  const t={dashboard:"Dashboard",attendance:"เช็กชื่อ",random:"สุ่มนักเรียน",scores:"คะแนน",behavior:"พฤติกรรม",students:"นักเรียน",links:"ลิงก์/QR",missingWork:"สรุปงานค้าง"};
  $("#pageTitle").textContent=t[v]||"Smart Classroom";
  if(v==="links")renderLinks();
}

function openMissingWorkDetail(studentId=""){
  renderMissingWorkDetail(studentId);
  setView("missingWork");
  window.scrollTo({top:0,behavior:"smooth"});
}
function openScoresFromMissingStat(){openMissingWorkDetail();}
$("#missingStudentsLink")?.addEventListener("click",openScoresFromMissingStat);
$("#missingStudentsLink")?.addEventListener("keydown",e=>{
  if(e.key==="Enter"||e.key===" "){e.preventDefault();openScoresFromMissingStat();}
});
document.addEventListener("click",e=>{
  const btn=e.target.closest?.("[data-missing-student]");
  if(btn)openMissingWorkDetail(btn.dataset.missingStudent||"");
});
$("#missingWorkBackBtn")?.addEventListener("click",()=>setView("dashboard"));

async function loadRooms(){
  const {data,error}=await sb.from("rooms").select("*").order("created_at");
  if(error)return toast(error.message);
  rooms=data||[];
  if(!rooms.length){
    const {data:r,error:e}=await sb.from("rooms").insert({owner_id:user.id,name:"ม.3/1",subject_name:""}).select().single();
    if(e)return toast(e.message);rooms=[r];
  }
  if(!currentRoomId||!rooms.some(r=>r.id===currentRoomId))currentRoomId=rooms[0].id;
  currentSubject=rooms.find(r=>r.id===currentRoomId)?.subject_name||"";
  renderSubjectSelect();
  renderRoomSelect();
  await loadRoomData();
}
function subjectLabel(v){return v?.trim()||"ยังไม่ระบุรายวิชา";}
function renderSubjectSelect(){
  const subjects=[...new Set(rooms.map(r=>r.subject_name||""))].sort((a,b)=>subjectLabel(a).localeCompare(subjectLabel(b),"th"));
  $("#subjectSelect").innerHTML=subjects.map(s=>`<option value="${esc(s)}">${esc(subjectLabel(s))}</option>`).join("");
  if(!subjects.includes(currentSubject))currentSubject=subjects[0]||"";
  $("#subjectSelect").value=currentSubject;
}
function filteredRooms(){return rooms.filter(r=>(r.subject_name||"")===currentSubject)}
function renderRoomSelect(){
  const list=filteredRooms();
  if(!list.some(r=>r.id===currentRoomId))currentRoomId=list[0]?.id||rooms[0]?.id||null;
  $("#roomSelect").innerHTML=list.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("");
  $("#roomSelect").value=currentRoomId||"";
}
$("#subjectSelect").onchange=async e=>{
  const nextSubject=e.target.value;
  if(hasUnsavedScores()&&!confirmDiscardUnsavedScores()){e.target.value=currentSubject;return;}
  clearWorkScoresDirty();clearExamScoresDirty();
  currentSubject=nextSubject;
  currentRoomId=filteredRooms()[0]?.id||null;
  currentWorkId=null;randomHistory=[];
  renderRoomSelect();
  if(currentRoomId)await loadRoomData();
};
$("#roomSelect").onchange=async e=>{
  const nextRoom=e.target.value;
  if(hasUnsavedScores()&&!confirmDiscardUnsavedScores()){e.target.value=currentRoomId||"";return;}
  clearWorkScoresDirty();clearExamScoresDirty();
  currentRoomId=nextRoom;currentSubject=rooms.find(r=>r.id===currentRoomId)?.subject_name||currentSubject;currentWorkId=null;randomHistory=[];await loadRoomData()
};
$("#addRoomBtn").onclick=()=>openModal("เพิ่มห้องเรียน",`<label>ชื่อห้อง<input id="mRoom" placeholder="เช่น ม.4/1"></label><label>ชื่อรายวิชา<input id="mSubject" placeholder="เช่น ประวัติศาสตร์ 3" value="${esc(currentSubject)}"></label>`,async()=>{
  const name=$("#mRoom").value.trim(),subject_name=$("#mSubject").value.trim();if(!name)return toast("กรอกชื่อห้อง");
  const {data:r,error}=await sb.from("rooms").insert({owner_id:user.id,name,subject_name}).select().single();if(error)return toast(error.message);
  currentRoomId=r.id;currentSubject=subject_name;closeModal();await loadRooms();toast("เพิ่มห้องแล้ว");
});
$("#renameRoomBtn").onclick=()=>{
  const r=rooms.find(r=>r.id===currentRoomId);
  openModal("แก้ไขห้องและรายวิชา",`<label>ชื่อห้อง<input id="mRoom" value="${esc(r?.name||"")}"></label><label>ชื่อรายวิชา<input id="mSubject" value="${esc(r?.subject_name||"")}" placeholder="เช่น ประวัติศาสตร์ 3"></label>`,async()=>{
    const name=$("#mRoom").value.trim(),subject_name=$("#mSubject").value.trim();if(!name)return toast("กรอกชื่อห้อง");
    const {error}=await sb.from("rooms").update({name,subject_name}).eq("id",currentRoomId);if(error)return toast(error.message);
    currentSubject=subject_name;closeModal();await loadRooms();toast("แก้ไขห้อง/รายวิชาแล้ว");
  });
};
$("#deleteRoomBtn").onclick=async()=>{
  if(!confirm("ลบห้องนี้พร้อมนักเรียน คะแนน และข้อมูลทั้งหมดหรือไม่?"))return;
  const {error}=await sb.from("rooms").delete().eq("id",currentRoomId);if(error)return toast(error.message);
  currentRoomId=null;await loadRooms();toast("ลบห้องแล้ว");
};

async function loadRoomData(){
  const [s,w,a,ah,b,sc,ex]=await Promise.all([
    sb.from("students").select("*").eq("room_id",currentRoomId).order("student_no"),
    termFilters(sb.from("assignments").select("*").eq("room_id",currentRoomId)).order("created_at"),
    attendancePeriod ? termFilters(sb.from("attendance").select("*").eq("room_id",currentRoomId).eq("day",attendanceDate).eq("period",attendancePeriod)) : Promise.resolve({data:[],error:null}),
    termFilters(sb.from("attendance").select("student_id,day,period,status,note").eq("room_id",currentRoomId)).order("day").order("period"),
    sb.from("behavior").select("*").eq("room_id",currentRoomId),
    termFilters(sb.from("scores").select("*").eq("room_id",currentRoomId)),
    termFilters(sb.from("exam_scores").select("*").eq("room_id",currentRoomId))
  ]);
  for(const x of [s,w,a,ah,b,sc,ex])if(x.error)return toast(x.error.message);
  students=s.data||[];works=w.data||[];attendance=Object.fromEntries((a.data||[]).map(x=>[x.student_id,x.status]));attendanceNotes=Object.fromEntries((a.data||[]).map(x=>[x.student_id,x.note||""]));
  attendanceHistory=ah.data||[];
  behavior=Object.fromEntries((b.data||[]).map(x=>[x.student_id,x.stars]));
  scores={};(sc.data||[]).forEach(x=>{(scores[x.assignment_id]??={})[x.student_id]=x.score});
  examScores=Object.fromEntries((ex.data||[]).map(x=>[x.student_id,{midterm:x.midterm,final:x.final}]));
  if(!currentWorkId||!works.some(w=>w.id===currentWorkId))currentWorkId=works[0]?.id||null;
  renderAll();
}
function renderAll(){renderDashboard();renderMissingWorkDetail();renderAttendance();renderAttendanceSummary();renderRandom();renderScores();renderExamScores();renderBehavior();renderStudents();renderLinks()}

function renderDashboard(){
  const r=rooms.find(x=>x.id===currentRoomId);$("#heroRoom").textContent=`${r?.name||""}${r?.subject_name?` • ${r.subject_name}`:""} • ${termLabel()}`;
  $("#stStudents").textContent=students.length;$("#stPresent").textContent=Object.values(attendance).filter(x=>x==="present").length;$("#stWorks").textContent=works.length;
  const missingStudents=students.filter(s=>missingWorkCount(s.id)>0).length;
  const missingStat=$("#stMissingStudents"); if(missingStat)missingStat.textContent=missingStudents;
  const roomMax=100;
  const totals=students.map(s=>studentGrandTotal(s.id));
  $("#stAvg").textContent=totals.length?(totals.reduce((a,b)=>a+b,0)/totals.length).toFixed(1):"0";
  const avgMax=$("#stAvgMax"); if(avgMax)avgMax.textContent=`/ ${roomMax}`;
  const c={present:0,late:0,leave:0,absent:0,activity:0};students.forEach(s=>c[attendance[s.id]]!=null&&c[attendance[s.id]]++);
  const presentLabel=$("#stPresentLabel"); if(presentLabel)presentLabel.textContent=attendancePeriod?`มาเรียนคาบ ${attendancePeriod}`:"ยังไม่ได้เลือกคาบ";
  const missingTop5=[...students]
    .map(s=>({...s,missingCount:missingWorkCount(s.id)}))
    .filter(s=>s.missingCount>0)
    .sort((a,b)=>b.missingCount-a.missingCount||Number(a.student_no)-Number(b.student_no))
    .slice(0,5);
  const missingTop5Box=$("#dashMissingTop5");
  if(missingTop5Box){
    missingTop5Box.innerHTML=missingTop5.map((s,i)=>`<button type="button" class="missing-top5-item rank-${i+1}" data-missing-student="${s.id}" title="กดดูชิ้นงานที่ยังไม่ส่ง"><span class="missing-top5-rank">${i+1}</span><span class="missing-top5-name"><b>${s.student_no}. ${esc(s.name)}</b><small>กดดูรายละเอียดงานค้าง</small></span><strong>${s.missingCount}<small> ชิ้น</small></strong></button>`).join("")||`<div class="missing-top5-empty">🎉 นักเรียนส่งงานครบทุกชิ้นแล้ว</div>`;
  }
  $("#dashStars").innerHTML=[...students]
    .map(s=>({...s,total:studentGrandTotal(s.id)}))
    .sort((a,b)=>b.total-a.total||Number(a.student_no)-Number(b.student_no))
    .slice(0,5)
    .map((s,i)=>`<div class="topitem score-rank"><span><b class="rank-no">${i+1}</b> ${s.student_no}. ${esc(s.name)}</span><b>${s.total} / 100</b></div>`)
    .join("")||`<div class="empty">ยังไม่มีนักเรียน</div>`;

  const maxCourse=works.reduce((sum,w)=>sum+num(w.max_score),0);
  const caption=$("#dashScoreCaption");
  if(caption)caption.textContent=`${r?.name||""}${r?.subject_name?` • ${r.subject_name}`:""} • ชิ้นงาน 60 + กลางภาค 20 + ปลายภาค 20 = 100 คะแนน`;

  const notice=$("#dashScoreNotice");
  if(notice){
    if(maxCourse!==60){
      notice.classList.remove("hidden");
      notice.innerHTML=`⚠️ คะแนนเต็มของชิ้นงานที่ตั้งไว้ขณะนี้รวม <b>${maxCourse}</b> คะแนน กรุณาตั้งคะแนนเต็มของชิ้นงานทั้งหมดให้รวมเป็น <b>60 คะแนน</b>`;
    }else{
      notice.classList.add("hidden");
      notice.innerHTML="";
    }
  }

  const dashHead=$("#dashScoreHead");
  if(dashHead){
    const assignmentHeads=works.map((w,i)=>`<th class="assignment-col assignment-alt-${i%2}"><span>${esc(w.name)}</span><small>/${w.max_score}</small></th>`).join("");
    dashHead.innerHTML=`<tr>
      <th>เลขที่</th>
      <th>รหัสนักเรียน</th>
      <th>ชื่อ-นามสกุล</th>
      <th>ไม่ได้ส่งงาน<small>(ชิ้น)</small></th>
      ${assignmentHeads}
      <th class="course60-col">รวมชิ้นงาน<small>/60</small></th>
      <th class="mid20-col">กลางภาค<small>/20</small></th>
      <th class="final20-col">ปลายภาค<small>/20</small></th>
      <th class="total100-col">รวม<small>/100</small></th>
      <th>เกรด</th>
    </tr>`;
  }

  const dashBody=$("#dashScoreBody");
  if(dashBody){
    const colspan=9+works.length;
    dashBody.innerHTML=[...students]
      .sort((a,b)=>Number(a.student_no)-Number(b.student_no))
      .map(s=>{
        const e=examScores[s.id]||{};
        const course=courseworkRounded(s.id);
        const total=studentGrandTotal(s.id);
        const workCells=works.map((w,i)=>{
          const value=scores?.[w.id]?.[s.id];
          return `<td class="assignment-score assignment-alt-${i%2}">${value??"—"}</td>`;
        }).join("");
        return `<tr>
          <td>${s.student_no}</td>
          <td>${esc(s.student_code||"—")}</td>
          <td class="student-name ${missingWorkCount(s.id)>0?"student-name-missing":""}">${esc(s.name)}</td>
          <td>${missingWorkCount(s.id)>0
            ?`<button type="button" class="missing-work-badge has-missing missing-work-open" data-missing-student="${s.id}" title="กดดูชิ้นงานที่ยังไม่ส่ง">${missingWorkCount(s.id)}</button>`
            :`<span class="missing-work-badge no-missing">0</span>`}</td>
          ${workCells}
          <td class="course60-col"><b>${course}</b></td>
          <td class="mid20-col">${e.midterm??"—"}</td>
          <td class="final20-col">${e.final??"—"}</td>
          <td class="total100-col"><b>${total}</b></td>
          <td><span class="grade-badge">${gradeFromTotal(total)}</span></td>
        </tr>`;
      }).join("")||`<tr><td colspan="${colspan}" class="empty">ยังไม่มีนักเรียน</td></tr>`;
  }
}

function renderMissingWorkDetail(focusStudentId=""){
  const body=$("#missingWorkDetailBody"), summary=$("#missingWorkSummary");
  if(!body||!summary)return;
  const missing=[...students]
    .map(s=>({...s,missingNames:missingWorkNames(s.id)}))
    .filter(s=>s.missingNames.length>0)
    .sort((a,b)=>Number(a.student_no)-Number(b.student_no));
  const totalPieces=missing.reduce((n,s)=>n+s.missingNames.length,0);
  summary.innerHTML=`<div><span>นักเรียนมีงานค้าง</span><strong>${missing.length}</strong><small>คน</small></div><div><span>งานค้างรวม</span><strong>${totalPieces}</strong><small>ชิ้น</small></div>`;
  body.innerHTML=missing.map(s=>`<tr class="${s.id===focusStudentId?"missing-focus-row":""}" data-missing-row="${s.id}">
    <td>${s.student_no}</td><td>${esc(s.student_code||"—")}</td>
    <td class="student-name student-name-missing">${esc(s.name)}</td>
    <td><span class="missing-work-badge has-missing">${s.missingNames.length}</span></td>
    <td><div class="missing-assignment-list">${s.missingNames.map((name,i)=>`<span><b>${i+1}.</b> ${esc(name)}</span>`).join("")}</div></td>
  </tr>`).join("")||`<tr><td colspan="5" class="empty">🎉 นักเรียนส่งงานครบทุกชิ้นแล้ว</td></tr>`;
  if(focusStudentId){setTimeout(()=>document.querySelector(`[data-missing-row="${focusStudentId}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),60);}
}

function attendanceDateText(){
  return new Intl.DateTimeFormat("th-TH",{dateStyle:"full"}).format(new Date(attendanceDate+"T12:00:00"));
}
async function loadAttendanceForDate(day){
  attendanceDate=day||today();
  if(!attendancePeriod){attendance={};attendanceNotes={};renderAttendance();renderDashboard();return;}
  const {data,error}=await termFilters(sb.from("attendance").select("*").eq("room_id",currentRoomId).eq("day",attendanceDate).eq("period",attendancePeriod));
  if(error)return toast(error.message);
  attendance=Object.fromEntries((data||[]).map(x=>[x.student_id,x.status]));
  attendanceNotes=Object.fromEntries((data||[]).map(x=>[x.student_id,x.note||""]));
  renderAttendance();
  renderDashboard();
  toast(`เลือก ${attendanceDateText()} • คาบ ${attendancePeriod} แล้ว`);
}
function renderAttendance(){
  const dateInput=$("#attendanceDate");
  if(dateInput)dateInput.value=attendanceDate;
  const thaiDateBtn=$("#thaiDateBtn");
  if(thaiDateBtn)thaiDateBtn.textContent=attendanceDateText();
  const periodSelect=$("#attendancePeriod");
  if(periodSelect)periodSelect.value=attendancePeriod?String(attendancePeriod):"";
  const caption=$("#attendanceDateCaption");
  if(caption)caption.textContent=attendancePeriod?`กำลังเช็กชื่อ: ${attendanceDateText()} • คาบ ${attendancePeriod}`:`กำลังเช็กชื่อ: ${attendanceDateText()} • ⚠️ กรุณาเลือกคาบก่อนเช็กชื่อ`;
  const labs=[["present","มา"],["late","สาย"],["leave","ลา"],["absent","ขาด"],["activity","กิจกรรม"]];
  $("#attendanceList").innerHTML=students.map(s=>{
    const isLeave=attendance[s.id]==="leave";
    return `<div class="attendance-student">
      <div class="row">
        <div class="no">${s.student_no}</div>
        <b>${esc(s.name)}</b>
        <div class="actions">${labs.map(([k,n])=>`<button class="status ${k} ${attendance[s.id]===k?"on":""}" data-att="${s.id}" data-status="${k}" ${attendancePeriod?"":"disabled"}>${n}</button>`).join("")}</div>
      </div>
      ${isLeave?`<div class="leave-note-row">
        <label>เหตุผล/หมายเหตุการลา
          <input class="leave-note-input" data-leave-note="${s.id}" value="${esc(attendanceNotes[s.id]||"")}" placeholder="เช่น ซ้อมกีฬา, ไปกิจกรรม, วงโยธวาทิต, ลาป่วย">
        </label>
      </div>`:""}
    </div>`;
  }).join("")||`<div class="empty">ยังไม่มีนักเรียน</div>`;

  $$("[data-att]").forEach(b=>b.onclick=async()=>{
    const student_id=b.dataset.att,status=b.dataset.status;
    const note=status==="leave"?(attendanceNotes[student_id]||""):"";
    const {error}=await sb.from("attendance").upsert({owner_id:user.id,room_id:currentRoomId,student_id,day:attendanceDate,period:attendancePeriod,status,note,academic_year:academicYear,semester},{onConflict:"student_id,day,period,academic_year,semester"});
    if(error)return toast(error.message);
    attendance[student_id]=status;
    attendanceNotes[student_id]=note;
    await refreshAttendanceHistory();
    renderAttendance();renderDashboard();
    if(status==="leave"){
      setTimeout(()=>document.querySelector(`[data-leave-note="${student_id}"]`)?.focus(),0);
    }
  });

  $$("[data-leave-note]").forEach(inp=>{
    inp.onchange=async()=>{
      const student_id=inp.dataset.leaveNote;
      const note=inp.value.trim();
      const {error}=await sb.from("attendance").upsert({
        owner_id:user.id,room_id:currentRoomId,student_id,day:attendanceDate,period:attendancePeriod,status:"leave",note,academic_year:academicYear,semester
      },{onConflict:"student_id,day,period,academic_year,semester"});
      if(error)return toast(error.message);
      attendance[student_id]="leave";
      attendanceNotes[student_id]=note;
      await refreshAttendanceHistory();
      toast("บันทึกหมายเหตุการลาแล้ว");
    };
  });
}

function shortThaiDate(day){
  const d=new Date(day+"T12:00:00");
  const months=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
function fullThaiDate(day){
  return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric"}).format(new Date(day+"T12:00:00"));
}
function attendanceMark(status){
  return ({present:"/",late:"ส",leave:"ล",absent:"ข",activity:"ก"})[status]||"";
}
async function refreshAttendanceHistory(){
  const {data,error}=await termFilters(sb.from("attendance").select("student_id,day,period,status,note").eq("room_id",currentRoomId)).order("day").order("period");
  if(error)return toast(error.message);
  attendanceHistory=data||[];
  renderAttendanceSummary();
}
function renderAttendanceSummary(){
  const head=$("#attendanceSummaryHead"),body=$("#attendanceSummaryBody"),foot=$("#attendanceSummaryFoot"),cards=$("#attendanceDailyCards");
  if(!head||!body||!foot||!cards)return;

  const sessions=[...new Map(attendanceHistory.map(x=>[`${x.day}|${Number(x.period)||1}`,{day:x.day,period:Number(x.period)||1}])).values()]
    .sort((a,b)=>a.day.localeCompare(b.day)||a.period-b.period);
  const sessionKey=(day,period)=>`${day}|${period}`;
  const byStudent={},notesByStudent={};
  attendanceHistory.forEach(x=>{
    const key=sessionKey(x.day,Number(x.period)||1);
    (byStudent[x.student_id]??={})[key]=x.status;
    (notesByStudent[x.student_id]??={})[key]=x.note||"";
  });

  const roomObj=rooms.find(r=>r.id===currentRoomId);
  const caption=$("#attendanceSummaryCaption");
  if(caption)caption.textContent=`${roomObj?.name||""}${roomObj?.subject_name?` • ${roomObj.subject_name}`:""} • บันทึกแล้ว ${sessions.length} คาบ`;

  const sessionHeads=sessions.map(x=>`<th class="date-col" title="${fullThaiDate(x.day)} • คาบ ${x.period}">${shortThaiDate(x.day)}<small>คาบ ${x.period}</small></th>`).join("");
  head.innerHTML=`<tr>
    <th>เลขที่</th>
    <th>รหัสนักเรียน</th>
    <th class="name-col">ชื่อ-นามสกุล</th>
    <th>รวมคาบเรียน</th>
    ${sessionHeads}
    <th>มา</th><th>สาย</th><th>ลา</th><th>ขาด</th><th>กิจกรรม</th><th>รวมคาบลา</th>
  </tr>`;

  if(!students.length){
    body.innerHTML=`<tr><td colspan="${9+sessions.length}" class="empty">ยังไม่มีนักเรียน</td></tr>`;
    foot.innerHTML="";
    cards.innerHTML="";
    return;
  }

  body.innerHTML=[...students].sort((a,b)=>Number(a.student_no)-Number(b.student_no)).map(s=>{
    const rec=byStudent[s.id]||{};
    const vals=Object.values(rec);
    const count=k=>vals.filter(v=>v===k).length;
    const cells=sessions.map(x=>{
      const key=sessionKey(x.day,x.period),st=rec[key],note=notesByStudent[s.id]?.[key]||"";
      const tip=st==="leave"&&note?` title="${esc(note)}"`:"";
      return `<td class="att-mark ${st||""}"${tip}>${attendanceMark(st)}</td>`;
    }).join("");
    return `<tr>
      <td>${s.student_no}</td>
      <td>${esc(s.student_code||"—")}</td>
      <td class="name-col">${esc(s.name)}</td>
      <td><b>${vals.length}</b></td>
      ${cells}
      <td>${count("present")}</td>
      <td>${count("late")}</td>
      <td>${count("leave")}</td>
      <td>${count("absent")}</td>
      <td><b>${count("leave")+count("absent")}</b></td>
    </tr>`;
  }).join("");

  const sessionSummary=sessions.map(x=>{
    const rows=attendanceHistory.filter(r=>r.day===x.day&&(Number(r.period)||1)===x.period);
    const count=k=>rows.filter(r=>r.status===k).length;
    return {day:x.day,period:x.period,present:count("present"),late:count("late"),leave:count("leave"),absent:count("absent"),activity:count("activity"),total:rows.length};
  });

  foot.innerHTML=sessions.length?`<tr class="summary-foot-row">
    <td colspan="4"><b>จำนวนผู้มาเรียนรายคาบ</b></td>
    ${sessionSummary.map(x=>`<td title="${fullThaiDate(x.day)} • คาบ ${x.period}"><b>${x.present}</b></td>`).join("")}
    <td colspan="6"></td>
  </tr>`:"";

  cards.innerHTML=sessionSummary.map(x=>`<div class="daily-summary-card">
    <b>${fullThaiDate(x.day)} • คาบ ${x.period}</b>
    <div class="daily-counts"><span>มา <strong>${x.present}</strong></span><span>สาย <strong>${x.late}</strong></span><span>ลา <strong>${x.leave}</strong></span><span>ขาด <strong>${x.absent}</strong></span><span class="activity-count">กิจกรรม <strong>${x.activity}</strong></span><span class="total-leave">รวมคาบลา <strong>${x.leave+x.absent}</strong></span></div>
  </div>`).join("")||`<div class="empty">ยังไม่มีข้อมูลการเช็กชื่อ</div>`;
}
$("#refreshAttendanceSummaryBtn").onclick=refreshAttendanceHistory;

let calendarViewDate=null;
const THAI_MONTHS_FULL=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function openThaiCalendar(){
  calendarViewDate=new Date((attendanceDate||today())+"T12:00:00");
  $("#inlineThaiCalendar").classList.remove("hidden");
  renderThaiCalendar();
}
function closeThaiCalendar(){
  $("#inlineThaiCalendar").classList.add("hidden");
}
function renderThaiCalendar(){
  if(!calendarViewDate)return;
  const y=calendarViewDate.getFullYear(),m=calendarViewDate.getMonth();
  $("#calMonthTitle").textContent=`${THAI_MONTHS_FULL[m]} ${y+543}`;
  $("#calSelectedText").textContent=`วันที่เลือก: ${attendanceDateText()}`;

  const first=new Date(y,m,1);
  const last=new Date(y,m+1,0);
  const startDay=first.getDay();
  const todayStr=today();
  const cells=[];

  for(let i=0;i<startDay;i++)cells.push('<button type="button" class="thai-cal-day blank" disabled></button>');
  for(let d=1;d<=last.getDate();d++){
    const dt=new Date(y,m,d,12,0,0);
    const val=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isSelected=val===attendanceDate;
    const isToday=val===todayStr;
    const isFuture=val>todayStr;
    cells.push(`<button type="button" class="thai-cal-day ${isSelected?"selected":""} ${isToday?"today":""}" data-cal-day="${val}" ${isFuture?"disabled":""}>${d}</button>`);
  }
  $("#thaiCalGrid").innerHTML=cells.join("");
}

$("#thaiCalGrid").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-cal-day]");
  if(!btn||btn.disabled)return;
  const day=btn.dataset.calDay;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  attendanceDate=day;
  const hidden=$("#attendanceDate");
  if(hidden)hidden.value=day;
  const thaiDateBtn=$("#thaiDateBtn");
  if(thaiDateBtn)thaiDateBtn.textContent=attendanceDateText();
  await loadAttendanceForDate(day);
  calendarViewDate=new Date(day+"T12:00:00");
  renderThaiCalendar();
});

$("#thaiDateBtn").onclick=()=>{
  const panel=$("#inlineThaiCalendar");
  if(panel.classList.contains("hidden"))openThaiCalendar();
  else closeThaiCalendar();
};
$("#calCancelBtn").onclick=closeThaiCalendar;
$("#calTodayBtn").onclick=async()=>{
  await loadAttendanceForDate(today());
  calendarViewDate=new Date(today()+"T12:00:00");
  renderThaiCalendar();
};
$("#calPrevMonth").onclick=()=>{calendarViewDate=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()-1,1,12);renderThaiCalendar();};
$("#calNextMonth").onclick=()=>{
  const next=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()+1,1,12);
  const now=new Date(today()+"T12:00:00");
  if(next.getFullYear()>now.getFullYear() || (next.getFullYear()===now.getFullYear()&&next.getMonth()>now.getMonth()))return;
  calendarViewDate=next;renderThaiCalendar();
};
$("#todayAttendanceBtn").onclick=async()=>await loadAttendanceForDate(today());
$("#attendancePeriod").onchange=async e=>{
  attendancePeriod=e.target.value?Math.max(1,Math.min(9,Number(e.target.value))):null;
  await loadAttendanceForDate(attendanceDate);
};
$("#saveAttendanceBtn").onclick=async()=>{
  if(!attendancePeriod)return alert("⚠️ กรุณาเลือกคาบเรียนก่อนบันทึกข้อมูล");
  const rows=students
    .filter(s=>attendance[s.id])
    .map(s=>({owner_id:user.id,room_id:currentRoomId,student_id:s.id,day:attendanceDate,period:attendancePeriod,status:attendance[s.id],note:attendance[s.id]==="leave"?(attendanceNotes[s.id]||""):"",academic_year:academicYear,semester}));
  if(!rows.length){
    alert("⚠️ ยังไม่มีข้อมูลการเช็กชื่อสำหรับบันทึก");
    return;
  }
  const {error}=await sb.from("attendance").upsert(rows,{onConflict:"student_id,day,period,academic_year,semester"});
  if(error){
    alert("❌ บันทึกข้อมูลไม่สำเร็จ\n"+error.message);
    return;
  }
  await refreshAttendanceHistory();
  renderDashboard();
  alert(`✅ บันทึกข้อมูลการเช็กชื่อเรียบร้อยแล้ว\n${attendanceDateText()} • คาบ ${attendancePeriod}`);
};
$("#allPresentBtn").onclick=async()=>{
  if(!attendancePeriod)return alert("⚠️ กรุณาเลือกคาบเรียนก่อนกำหนดมาเรียนทั้งหมด");
  if(!students.length)return;
  const rows=students.map(s=>({owner_id:user.id,room_id:currentRoomId,student_id:s.id,day:attendanceDate,period:attendancePeriod,status:"present",note:"",academic_year:academicYear,semester}));
  const {error}=await sb.from("attendance").upsert(rows,{onConflict:"student_id,day,period,academic_year,semester"});
  if(error)return toast(error.message);
  students.forEach(s=>{attendance[s.id]="present";attendanceNotes[s.id]="";});
  await refreshAttendanceHistory();
  renderAttendance();renderDashboard();toast(`กำหนดนักเรียนทุกคนเป็น “มา” แล้ว • ${attendanceDateText()} • คาบ ${attendancePeriod}`);
};

async function exportAttendanceExcel(){
  if(!window.XLSX)return toast("โหลดระบบ Excel ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต");
  if(!students.length)return toast("ยังไม่มีนักเรียน");

  const {data,error}=await termFilters(sb.from("attendance").select("student_id,day,period,status,note").eq("room_id",currentRoomId)).order("day").order("period");
  if(error)return toast(error.message);
  const records=data||[];
  if(!records.length)return toast("ยังไม่มีข้อมูลการเข้าเรียนสำหรับห้องนี้");

  const sessions=[...new Map(records.map(x=>[`${x.day}|${Number(x.period)||1}`,{day:x.day,period:Number(x.period)||1}])).values()]
    .sort((a,b)=>a.day.localeCompare(b.day)||a.period-b.period);
  const keyOf=(day,period)=>`${day}|${period}`;
  const byStudent={},noteByStudent={};
  records.forEach(x=>{
    const key=keyOf(x.day,Number(x.period)||1);
    (byStudent[x.student_id]??={})[key]=x.status;
    (noteByStudent[x.student_id]??={})[key]=x.note||"";
  });

  const thStatus={present:"/",late:"ส",leave:"ล",absent:"ข"};
  const roomObj=rooms.find(r=>r.id===currentRoomId);
  const room=roomObj?.name||"ห้องเรียน";
  const subject=roomObj?.subject_name||"ยังไม่ระบุรายวิชา";

  const detailHeaders=["เลขที่","รหัสนักเรียน","ชื่อ-นามสกุล","รวมคาบเรียน",...sessions.map(x=>`${shortThaiDate(x.day)} คาบ ${x.period}`),"มา","สาย","ลา","ขาด","รวมคาบลา"];
  const detailRows=[...students].sort((a,b)=>Number(a.student_no)-Number(b.student_no)).map(s=>{
    const rec=byStudent[s.id]||{};
    const vals=Object.values(rec);
    const count=k=>vals.filter(v=>v===k).length;
    return [
      s.student_no,s.student_code||"",s.name,vals.length,
      ...sessions.map(x=>thStatus[rec[keyOf(x.day,x.period)]]||""),
      count("present"),count("late"),count("leave"),count("absent"),count("leave")+count("absent")
    ];
  });

  const sessionPresentRow=["","","จำนวนมาเรียนรายคาบ","",...sessions.map(x=>records.filter(r=>r.day===x.day&&(Number(r.period)||1)===x.period&&r.status==="present").length),"","","","",""];
  const wsDaily=XLSX.utils.aoa_to_sheet([
    ["BJR Smart Classroom V5.5.11"],
    [`สรุปการเข้าเรียนรายคาบ: ${room}`],
    [`รายวิชา: ${subject}`],
    [`ช่วงข้อมูล: ${fullThaiDate(sessions[0].day)} ถึง ${fullThaiDate(sessions[sessions.length-1].day)}`],
    ["สัญลักษณ์: / = มา | ส = สาย | ล = ลา | ข = ขาด | ก = กิจกรรม"],
    [],detailHeaders,...detailRows,sessionPresentRow
  ]);
  wsDaily["!cols"]=[{wch:8},{wch:16},{wch:28},{wch:12},...sessions.map(()=>({wch:14})),{wch:8},{wch:8},{wch:8},{wch:8},{wch:12}];
  wsDaily["!freeze"]={xSplit:4,ySplit:7};

  const personHeaders=["เลขที่","รหัสนักเรียน","ชื่อ-นามสกุล","มา","สาย","ลา","ขาด","กิจกรรม","รวมคาบลา","บันทึกรวม","หมายเหตุการลา"];
  const personRows=[...students].sort((a,b)=>Number(a.student_no)-Number(b.student_no)).map(s=>{
    const vals=Object.values(byStudent[s.id]||{});
    const count=k=>vals.filter(v=>v===k).length;
    const leaveNotes=sessions
      .filter(x=>byStudent[s.id]?.[keyOf(x.day,x.period)]==="leave"&&noteByStudent[s.id]?.[keyOf(x.day,x.period)])
      .map(x=>`${fullThaiDate(x.day)} คาบ ${x.period}: ${noteByStudent[s.id][keyOf(x.day,x.period)]}`)
      .join(" | ");
    return [s.student_no,s.student_code||"",s.name,count("present"),count("late"),count("leave"),count("absent"),count("activity"),count("leave")+count("absent"),vals.length,leaveNotes];
  });
  const wsPerson=XLSX.utils.aoa_to_sheet([
    ["BJR Smart Classroom V5.5.11"],
    [`สรุปสถิติการเข้าเรียนรายบุคคล: ${room}`],
    [`รายวิชา: ${subject}`],
    [],personHeaders,...personRows
  ]);
  wsPerson["!cols"]=[{wch:8},{wch:16},{wch:28},{wch:10},{wch:10},{wch:10},{wch:10},{wch:12},{wch:12},{wch:55}];
  wsPerson["!freeze"]={xSplit:0,ySplit:5};

  const dateHeaders=["ลำดับ","วันที่","คาบ","มา","สาย","ลา","ขาด","กิจกรรม","รวมคาบลา","บันทึกรวม","หมายเหตุการลา"];
  const dateRows=sessions.map((x,i)=>{
    const rows=records.filter(r=>r.day===x.day&&(Number(r.period)||1)===x.period);
    const count=k=>rows.filter(r=>r.status===k).length;
    const leaveDetails=rows.filter(r=>r.status==="leave"&&r.note).map(r=>{
      const st=students.find(s=>s.id===r.student_id);
      return `${st?.name||"นักเรียน"}: ${r.note}`;
    }).join(" | ");
    return [i+1,fullThaiDate(x.day),x.period,count("present"),count("late"),count("leave"),count("absent"),count("activity"),count("leave")+count("absent"),rows.length,leaveDetails];
  });
  const wsDates=XLSX.utils.aoa_to_sheet([
    ["BJR Smart Classroom V5.5.11"],
    [`สรุปตามวันที่และคาบ: ${room}`],
    [`รายวิชา: ${subject}`],
    [],dateHeaders,...dateRows
  ]);
  wsDates["!cols"]=[{wch:8},{wch:18},{wch:8},{wch:10},{wch:10},{wch:10},{wch:10},{wch:12},{wch:12},{wch:55}];
  wsDates["!freeze"]={xSplit:0,ySplit:5};

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,wsDaily,"รายวัน");
  XLSX.utils.book_append_sheet(wb,wsPerson,"สรุปรายคน");
  XLSX.utils.book_append_sheet(wb,wsDates,"สรุปตามวันที่");
  const safeFile=room.replace(/[\\/:*?"<>|]/g,"-");
  XLSX.writeFile(wb,`สรุปการเข้าเรียน_${safeFile}.xlsx`);
  toast("สร้าง Excel พร้อมสรุปรายคาบแล้ว");
}
$("#exportAttendanceExcelBtn").onclick=exportAttendanceExcel;

function renderRandom(){
  $("#randomHistory").innerHTML=randomHistory.map((s,i)=>`<div class="topitem"><span>${i+1}. ${s.student_no}. ${esc(s.name)}</span></div>`).join("")||`<div class="empty">ยังไม่มีประวัติ</div>`;
}
$("#randomBtn").onclick=()=>{
  if(!students.length)return toast("ยังไม่มีนักเรียน");
  const used=new Set(randomHistory.map(x=>x.id));let pool=students.filter(x=>!used.has(x.id));
  if(!pool.length){randomHistory=[];pool=students;toast("ครบทุกคนแล้ว เริ่มรอบใหม่")}
  let n=0;const t=setInterval(()=>{const x=pool[Math.floor(Math.random()*pool.length)];$("#randNo").textContent=x.student_no;$("#randName").textContent=x.name;if(++n>12){clearInterval(t);const p=pool[Math.floor(Math.random()*pool.length)];$("#randNo").textContent=p.student_no;$("#randName").textContent=p.name;randomHistory.unshift(p);renderRandom()}},70);
};
$("#clearRandomBtn").onclick=()=>{randomHistory=[];$("#randNo").textContent="?";$("#randName").textContent="พร้อมสุ่ม";renderRandom()};

function clipboardScoreGrid(text){
  const clean=String(text??"").replace(/\r/g,"").trim();
  if(!clean)return [];
  return clean.split("\n").map(line=>line.split("\t").map(v=>v.trim()));
}
function normalizePastedScore(value,maxScore){
  const raw=String(value??"").trim();
  if(raw==="")return "";
  const normalized=raw.replace(",",".");
  const n=Number(normalized);
  if(!Number.isFinite(n))return null;
  return String(Math.max(0,Math.min(Number(maxScore),n)));
}
function fireScoreInput(input){
  input.dispatchEvent(new Event("input",{bubbles:true}));
}
function pasteDownScoreColumn(e,inputs,startIndex,maxScore,label){
  const grid=clipboardScoreGrid(e.clipboardData?.getData("text/plain"));
  if(!grid.length)return false;
  const values=grid.flat().filter(v=>v!=="");
  if(values.length<=1)return false;
  e.preventDefault();
  let written=0;
  values.forEach((value,offset)=>{
    const input=inputs[startIndex+offset]; if(!input)return;
    const score=normalizePastedScore(value,maxScore); if(score===null)return;
    input.value=score; fireScoreInput(input); written++;
  });
  toast(`วาง${label} ${written} คนแล้ว • กรุณากดบันทึก`);
  return true;
}
function installExamBulkPaste(){
  const mids=$$("[data-mid]"), finals=$$("[data-final]");
  const attach=(inputs,kind)=>inputs.forEach((inp,index)=>{
    inp.onpaste=e=>{
      const grid=clipboardScoreGrid(e.clipboardData?.getData("text/plain"));
      if(!grid.length)return;
      const hasTwoCols=kind==="mid" && grid.some(row=>row.length>=2);
      if(hasTwoCols){
        e.preventDefault();
        let written=0;
        grid.forEach((row,offset)=>{
          const mi=mids[index+offset], fi=finals[index+offset];
          if(!mi&&!fi)return;
          if(mi && row[0]!==undefined && row[0]!==""){
            const v=normalizePastedScore(row[0],20); if(v!==null){mi.value=v;fireScoreInput(mi);written++;}
          }
          if(fi && row[1]!==undefined && row[1]!==""){
            const v=normalizePastedScore(row[1],20); if(v!==null){fi.value=v;fireScoreInput(fi);written++;}
          }
        });
        toast(`วางคะแนนกลางภาค/ปลายภาค ${written} ช่องแล้ว • กรุณากดบันทึก`);
        return;
      }
      pasteDownScoreColumn(e,inputs,index,20,kind==="mid"?"คะแนนกลางภาค":"คะแนนปลายภาค");
    };
  });
  attach(mids,"mid"); attach(finals,"final");
}

function renderScores(){
  $("#workTabs").innerHTML=works.map((w,i)=>`<button class="tab work-tab-alt-${i%2} ${w.id===currentWorkId?"active":""}" data-work="${w.id}">${esc(w.name)}</button>`).join("");
  $$("[data-work]").forEach(b=>b.onclick=()=>{
    if(b.dataset.work===currentWorkId)return;
    if(unsavedWorkScores&&!confirmDiscardUnsavedScores())return;
    clearWorkScoresDirty();
    currentWorkId=b.dataset.work;renderScores()
  });
  const w=works.find(x=>x.id===currentWorkId);$("#workEditor").classList.toggle("hidden",!w);$("#noWork").classList.toggle("hidden",!!w);if(!w)return;
  $("#workName").value=w.name;$("#workMax").value=w.max_score;
  $("#scoreList").innerHTML=students.map(s=>`<div class="row"><div class="no">${s.student_no}</div><b class="${missingWorkCount(s.id)>0?"student-name-missing":""}">${esc(s.name)}</b><input class="scoreinp" data-score="${s.id}" type="number" inputmode="decimal" min="0" max="${w.max_score}" value="${scores[w.id]?.[s.id]??""}" placeholder="คะแนน"></div>`).join("")||`<div class="empty">ยังไม่มีนักเรียน</div>`;
  const scoreInputs=$$("#scoreList .scoreinp");
  scoreInputs.forEach((inp,index)=>{
    inp.addEventListener("input",markWorkScoresDirty);
    inp.addEventListener("paste",markWorkScoresDirty);
    inp.onkeydown=e=>{
      if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
      e.preventDefault();
      const next=scoreInputs[index+(e.key==="ArrowDown"?1:-1)];
      if(next){next.focus();next.select();}
    };
    inp.onpaste=e=>pasteDownScoreColumn(e,scoreInputs,index,w.max_score,"คะแนนเก็บ");
  });
}
$("#addWorkBtn").onclick=()=>openModal("เพิ่มชิ้นงาน",`<label>ชื่องาน<input id="mWork" placeholder="เช่น ใบงานที่ 1"></label><label>คะแนนเต็ม<input id="mMax" type="number" min="1" value="10"></label>`,async()=>{
  const name=$("#mWork").value.trim(),max_score=Number($("#mMax").value);if(!name||max_score<1)return toast("กรอกข้อมูลให้ครบ");
  const {data,error}=await sb.from("assignments").insert({owner_id:user.id,room_id:currentRoomId,name,max_score,academic_year:academicYear,semester}).select().single();if(error)return toast(error.message);closeModal();currentWorkId=data.id;await loadRoomData();toast("เพิ่มชิ้นงานแล้ว");
});
$("#saveWorkBtn").onclick=async()=>{const w=works.find(x=>x.id===currentWorkId),name=$("#workName").value.trim(),max_score=Number($("#workMax").value);if(!w||!name||max_score<1)return;const {error}=await sb.from("assignments").update({name,max_score}).eq("id",w.id);if(error)return toast(error.message);await loadRoomData();toast("บันทึกชื่องานแล้ว")};
$("#deleteWorkBtn").onclick=async()=>{if(!currentWorkId||!confirm("ลบชิ้นงานและคะแนนทั้งหมดหรือไม่?"))return;const {error}=await sb.from("assignments").delete().eq("id",currentWorkId);if(error)return toast(error.message);currentWorkId=null;await loadRoomData();toast("ลบงานแล้ว")};
$("#saveScoresBtn").onclick=async()=>{
  const w=works.find(x=>x.id===currentWorkId);if(!w)return;
  const rows=[];$$("[data-score]").forEach(i=>{if(i.value!=="")rows.push({owner_id:user.id,room_id:currentRoomId,assignment_id:w.id,student_id:i.dataset.score,score:Math.max(0,Math.min(Number(w.max_score),Number(i.value))),academic_year:academicYear,semester})});
  if(rows.length){const {error}=await sb.from("scores").upsert(rows,{onConflict:"assignment_id,student_id"});if(error)return toast(error.message)}
  clearWorkScoresDirty();
  await loadRoomData();toast("บันทึกคะแนนแล้ว");savePopup("บันทึกคะแนนเก็บเรียบร้อยแล้ว");
};

function renderExamScores(){
  const body=$("#examScoreList"); if(!body)return;
  body.innerHTML=students.map(s=>{
    const e=examScores[s.id]||{}, course=courseworkRounded(s.id), total=studentGrandTotal(s.id), grade=gradeFromTotal(total);
    return `<tr><td>${s.student_no}</td><td>${esc(s.student_code||"—")}</td><td class="student-name ${missingWorkCount(s.id)>0?"student-name-missing":""}">${esc(s.name)}</td><td class="course60-col"><b>${course}</b></td><td class="mid20-col"><input class="exam-input mid-input" data-mid="${s.id}" type="number" min="0" max="20" step="0.5" value="${e.midterm??""}" placeholder="0-20"></td><td class="final20-col"><input class="exam-input final-input" data-final="${s.id}" type="number" min="0" max="20" step="0.5" value="${e.final??""}" placeholder="0-20"></td><td class="total100-col"><b data-grand="${s.id}">${total}</b></td><td><span class="grade-badge" data-grade="${s.id}">${grade}</span></td></tr>`;
  }).join("")||`<tr><td colspan="8">ยังไม่มีนักเรียน</td></tr>`;
  $$('[data-mid], [data-final]').forEach(i=>i.oninput=()=>{
    markExamScoresDirty();
    const id=i.dataset.mid||i.dataset.final, mid=num($(`[data-mid="${id}"]`)?.value), fin=num($(`[data-final="${id}"]`)?.value);
    const total=courseworkRounded(id)+Math.min(20,Math.max(0,mid))+Math.min(20,Math.max(0,fin));
    const g=$(`[data-grand="${id}"]`), gr=$(`[data-grade="${id}"]`); if(g)g.textContent=total; if(gr)gr.textContent=gradeFromTotal(total);
  });
  ["mid","final"].forEach(kind=>{
    const inputs=$$(`[data-${kind}]`);
    inputs.forEach((inp,index)=>{
      inp.onkeydown=e=>{
        if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
        e.preventDefault();
        const next=inputs[index+(e.key==="ArrowDown"?1:-1)];
        if(next){next.focus();next.select();}
      };
    });
  });
  $$('[data-mid], [data-final]').forEach(i=>i.addEventListener("paste",markExamScoresDirty));
  installExamBulkPaste();
}

$("#saveExamScoresBtn").onclick=async()=>{
  if(!students.length)return toast("ยังไม่มีนักเรียน");
  const rows=students.map(s=>{
    const mi=$(`[data-mid="${s.id}"]`), fi=$(`[data-final="${s.id}"]`);
    const midterm=mi?.value===""?null:Math.min(20,Math.max(0,Number(mi.value)));
    const final=fi?.value===""?null:Math.min(20,Math.max(0,Number(fi.value)));
    return {owner_id:user.id,room_id:currentRoomId,student_id:s.id,midterm,final,academic_year:academicYear,semester};
  });
  const {error}=await sb.from("exam_scores").upsert(rows,{onConflict:"student_id,academic_year,semester"});
  if(error)return toast(error.message);
  clearExamScoresDirty();
  await loadRoomData();toast("บันทึกคะแนนกลางภาคและปลายภาคแล้ว");savePopup("บันทึกคะแนนกลางภาคและคะแนนปลายภาคเรียบร้อยแล้ว");
};


function courseworkExcelValue(value){
  const n=Number(value)||0;
  const fraction=n-Math.floor(n);
  return fraction>=0.5?Math.ceil(n):n;
}
function exportRoomExcel(){
  if(!window.XLSX)return toast("โหลดระบบ Excel ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต");
  if(!students.length)return toast("ยังไม่มีนักเรียน");
  const room=rooms.find(r=>r.id===currentRoomId)?.name||"ห้องเรียน";
  const headers=["เลขที่","รหัสนักเรียน","ชื่อ-นามสกุล",...works.map(w=>`${w.name} (${w.max_score})`),"คะแนนชิ้นงานรวม","ไม่ได้ส่งงาน (ชิ้น)","กลางภาค (20)","ปลายภาค (20)","คะแนนรวม","เกรด"];
  const rows=students.map(s=>{
    const e=examScores[s.id]||{}, course=courseworkTotal(s.id), courseExcel=courseworkExcelValue(course), total=courseExcel+num(e.midterm)+num(e.final);
    return [s.student_no,s.student_code||"",s.name,...works.map(w=>scores[w.id]?.[s.id]??""),courseExcel,missingWorkCount(s.id),e.midterm??"",e.final??"",total,gradeFromTotal(total)];
  });
  const ws=XLSX.utils.aoa_to_sheet([
    ["BJR Smart Classroom V5.5.11"],
    [`สรุปคะแนนรายห้อง: ${room}`],[`รายวิชา: ${rooms.find(r=>r.id===currentRoomId)?.subject_name||"ยังไม่ระบุรายวิชา"}`],[termLabel()],
    ["เกณฑ์เกรด: 0=0-49 | 1=50-54 | 1.5=55-59 | 2=60-64 | 2.5=65-69 | 3=70-74 | 3.5=75-79 | 4=80-100"],
    ["หมายเหตุ: คะแนนชิ้นงานรวม /60 หากมีเศษตั้งแต่ .5 ขึ้นไป ระบบปัดขึ้นเป็นจำนวนเต็ม และใช้ค่าที่ปัดแล้วคำนวณคะแนนรวม /100 และเกรด โดยไม่แก้คะแนนดิบรายชิ้นงาน"],
    [],headers,...rows
  ]);
  ws['!cols']=headers.map((h,i)=>({wch:i===1?28:Math.max(10,Math.min(22,String(h).length+2))}));
  ws['!freeze']={xSplit:0,ySplit:6};
  const wb=XLSX.utils.book_new();
  const safeSheet=room.replace(/[\/?*:[\]]/g,"-").slice(0,31)||"คะแนน";
  XLSX.utils.book_append_sheet(wb,ws,safeSheet);
  const safeFile=room.replace(/[\/:*?"<>|]/g,"-");
  XLSX.writeFile(wb,`สรุปคะแนน_${safeFile}.xlsx`);
  toast("สร้างไฟล์ Excel ห้องนี้แล้ว");
}
$("#exportExcelBtn").onclick=exportRoomExcel;

function renderBehavior(){
  $("#behaviorList").innerHTML=students.map(s=>`<div class="row"><div class="no">${s.student_no}</div><b>${esc(s.name)}</b><div class="actions"><button class="round minus" data-star="${s.id}" data-d="-1">−</button><span class="stars">⭐ ${behavior[s.id]||0}</span><button class="round plus" data-star="${s.id}" data-d="1">+</button></div></div>`).join("")||`<div class="empty">ยังไม่มีนักเรียน</div>`;
  $$("[data-star]").forEach(b=>b.onclick=async()=>{const student_id=b.dataset.star,stars=(behavior[student_id]||0)+Number(b.dataset.d);const {error}=await sb.from("behavior").upsert({owner_id:user.id,room_id:currentRoomId,student_id,stars},{onConflict:"student_id"});if(error)return toast(error.message);behavior[student_id]=stars;renderBehavior();renderDashboard()});
}

function renderStudents(){
  $("#studentList").innerHTML=students.map(s=>`<div class="row"><div class="no">${s.student_no}</div><div class="student-main"><b>${esc(s.name)}</b><small>รหัสนักเรียน: ${esc(s.student_code||"ยังไม่กรอก")}</small></div><div class="actions"><button class="btn ghost" data-editstu="${s.id}">แก้ไข</button><button class="btn danger" data-delstu="${s.id}">ลบ</button></div></div>`).join("")||`<div class="empty">ยังไม่มีนักเรียน</div>`;
  $$("[data-editstu]").forEach(b=>b.onclick=()=>{const s=students.find(x=>x.id===b.dataset.editstu);openStudent(s)});
  $$("[data-delstu]").forEach(b=>b.onclick=async()=>{if(!confirm("ลบนักเรียนและข้อมูลทั้งหมดของคนนี้หรือไม่?"))return;const {error}=await sb.from("students").delete().eq("id",b.dataset.delstu);if(error)return toast(error.message);await loadRoomData()});
}
function openStudent(s=null){openModal(s?"แก้ไขนักเรียน":"เพิ่มนักเรียน",`<label>เลขที่<input id="mNo" type="number" min="1" value="${s?.student_no??students.length+1}"></label><label>รหัสนักเรียน<input id="mCode" value="${esc(s?.student_code||"")}" placeholder="เช่น 12345"></label><label>ชื่อ-นามสกุล<input id="mName" value="${esc(s?.name||"")}"></label>`,async()=>{
  const student_no=Number($("#mNo").value),student_code=$("#mCode").value.trim(),name=$("#mName").value.trim();if(!student_no||!student_code||!name)return toast("กรอกเลขที่ รหัสนักเรียน และชื่อให้ครบ");
  let q=s?sb.from("students").update({student_no,student_code,name}).eq("id",s.id):sb.from("students").insert({owner_id:user.id,room_id:currentRoomId,student_no,student_code,name});
  const {error}=await q;if(error)return toast(error.message.includes("students_room_code_unique")?"รหัสนักเรียนนี้มีอยู่แล้วในห้อง/รายวิชานี้":error.message);closeModal();await loadRoomData();toast("บันทึกนักเรียนแล้ว");
})}
$("#addStudentBtn").onclick=()=>openStudent();
$("#importBtn").onclick=async()=>{
  const lines=$("#bulkNames").value.split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return toast("วางรายชื่อก่อน");
  const rows=[]; let autoNo=1;
  for(const line of lines){
    const p=line.split(/[,\t]/).map(x=>x.trim()).filter((x,i,a)=>i<a.length-1||x!=="");
    let student_no,student_code,name;
    if(p.length>=3){student_no=Number(p[0]);student_code=p[1];name=p.slice(2).join(" ");}
    else if(p.length===2){student_no=autoNo;student_code=p[0];name=p[1];}
    else {return toast(`รูปแบบไม่ถูกต้อง: ${line}`);}
    if(!student_no||!student_code||!name)return toast(`ข้อมูลไม่ครบ: ${line}`);
    rows.push({owner_id:user.id,room_id:currentRoomId,student_no,student_code,name}); autoNo=Math.max(autoNo+1,student_no+1);
  }
  const {error}=await sb.from("students").insert(rows);if(error)return toast(error.message.includes("students_room_code_unique")?"มีรหัสนักเรียนซ้ำภายในห้อง/รายวิชานี้":error.message);$("#bulkNames").value="";await loadRoomData();toast(`นำเข้า ${rows.length} คนแล้ว`);
};

function studentLink(s){const b=publicBase();const u=new URL(b,location.href);u.searchParams.set("student",s.access_token);return u.toString()}
function renderLinks(){
  $("#publicUrl").value=localStorage.getItem(PUBLIC_URL_KEY)||"";
  $("#linkList").innerHTML=students.map(s=>{const l=studentLink(s);return `<div class="row"><div class="no">${s.student_no}</div><div><b>${esc(s.name)}</b><small>รหัสนักเรียน: ${esc(s.student_code||"ยังไม่กรอก")}</small><div class="linktext">${esc(l)}</div></div><div class="actions"><button class="btn ghost" data-copy="${s.id}">คัดลอก</button><button class="btn primary" data-qr="${s.id}">QR</button><button class="btn ghost" data-preview="${s.id}">ดูหน้า</button><button class="btn danger" data-token="${s.id}">เปลี่ยนรหัส</button></div></div>`}).join("")||`<div class="empty">ยังไม่มีนักเรียน</div>`;
  $$("[data-copy]").forEach(b=>b.onclick=()=>copy(studentLink(students.find(s=>s.id===b.dataset.copy))));
  $$("[data-qr]").forEach(b=>b.onclick=()=>showQR(students.find(s=>s.id===b.dataset.qr)));
  $$("[data-preview]").forEach(b=>b.onclick=()=>window.open(studentLink(students.find(s=>s.id===b.dataset.preview)),"_blank"));
  $$("[data-token]").forEach(b=>b.onclick=async()=>{if(!confirm("ลิงก์เดิมของนักเรียนคนนี้จะใช้ไม่ได้ ต้องการเปลี่ยนรหัสหรือไม่?"))return;const {error}=await sb.rpc("rotate_student_token",{p_student_id:b.dataset.token});if(error)return toast(error.message);await loadRoomData();toast("เปลี่ยนรหัสแล้ว")});
}
function studentPortalLink(){const u=new URL(publicBase(),location.href);u.searchParams.set("portal","1");u.searchParams.set("owner",user.id);u.searchParams.delete("student");return u.toString()}
$("#savePublicUrlBtn").onclick=()=>{localStorage.setItem(PUBLIC_URL_KEY,$("#publicUrl").value.trim());renderLinks();toast("บันทึก URL แล้ว")};
$("#copyStudentPortalBtn").onclick=()=>copy(studentPortalLink());
$("#previewStudentPortalBtn").onclick=()=>window.open(studentPortalLink(),"_blank");
$("#qrStudentPortalBtn").onclick=()=>{const l=studentPortalLink();$("#qrTitle").textContent="QR กลางสำหรับนักเรียน";$("#qrLink").textContent=l;$("#qrBox").innerHTML="";new QRCode($("#qrBox"),{text:l,width:240,height:240});$("#qrModal").classList.remove("hidden")};
function copy(t){navigator.clipboard?.writeText(t).then(()=>toast("คัดลอกแล้ว")).catch(()=>prompt("คัดลอกลิงก์",t))}
function showQR(s){const l=studentLink(s);$("#qrTitle").textContent=s.name;$("#qrLink").textContent=l;$("#qrBox").innerHTML="";new QRCode($("#qrBox"),{text:l,width:240,height:240});$("#qrModal").classList.remove("hidden")}
$("#qrClose").onclick=()=>$("#qrModal").classList.add("hidden");

function renderCourseCard(c){
  const rows=(c.assignments||[]).map(a=>`<tr class="${a.score===null||a.score===undefined||a.score===""?"missing-assignment-row":""}"><td>${esc(a.name)}</td><td>${a.score??"<span class=\"not-submitted\">ยังไม่ส่ง</span>"}</td><td>${a.max_score}</td></tr>`).join("");
  const examRows=`<tr><td><b>กลางภาค</b></td><td>${c.exams?.midterm??"—"}</td><td>20</td></tr><tr><td><b>ปลายภาค</b></td><td>${c.exams?.final??"—"}</td><td>20</td></tr>`;
  return `<section class="course-card">
    <div class="course-head"><div><h3>${esc(c.subject_name||"ยังไม่ระบุรายวิชา")}</h3><p>${esc(c.room_name||"")}</p></div><span class="grade-pill">เกรด ${c.summary?.grade??0}</span></div>
    <div class="summary3 summary4 compact-summary">
      <div><span>คะแนนรวม</span><strong>${c.summary?.total_score??0}</strong></div>
      <div><span>คะแนนเต็ม</span><strong>${c.summary?.total_max??0}</strong></div>
      <div><span>คิดเป็น</span><strong>${c.summary?.percent??0}%</strong></div>
      <div><span>เกรด</span><strong>${c.summary?.grade??0}</strong></div>
      <div class="missing-summary"><span>ไม่ได้ส่งงาน</span><strong>${missingWorkCountFromAssignments(c.assignments)} ชิ้น</strong></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>ชิ้นงาน</th><th>คะแนน</th><th>เต็ม</th></tr></thead><tbody>${rows}${examRows}</tbody></table></div>
  </section>`;
}
function renderStudentPortalData(x){
  $("#spName").textContent=x.student.name;
  const code=x.student.student_code?` • รหัส ${x.student.student_code}`:"";

  if(Array.isArray(x.courses)){
    $("#spRoom").textContent=`${x.courses.length} รายวิชา${code}`;
    $("#spSingleCourse").classList.add("hidden");
    $("#spCourses").classList.remove("hidden");
    $("#spCourses").innerHTML=x.courses.map(renderCourseCard).join("")||`<div class="empty">ยังไม่มีรายวิชา</div>`;
    return;
  }

  $("#spSingleCourse").classList.remove("hidden");
  $("#spCourses").classList.add("hidden");
  $("#spCourses").innerHTML="";
  const subject=x.student.subject_name?` • ${x.student.subject_name}`:"";
  $("#spRoom").textContent=`${x.student.room_name}${subject} • เลขที่ ${x.student.student_no}${code}`;
  const assignmentRows=(x.assignments||[]).map(a=>`<tr class="${a.score===null||a.score===undefined||a.score===""?"missing-assignment-row":""}"><td>${esc(a.name)}</td><td>${a.score??"<span class=\"not-submitted\">ยังไม่ส่ง</span>"}</td><td>${a.max_score}</td></tr>`).join("");
  const examRows=`<tr><td><b>กลางภาค</b></td><td>${x.exams?.midterm??"—"}</td><td>20</td></tr><tr><td><b>ปลายภาค</b></td><td>${x.exams?.final??"—"}</td><td>20</td></tr>`;
  $("#spScores").innerHTML=assignmentRows+examRows;
  $("#spTotal").textContent=x.summary.total_score;$("#spMax").textContent=x.summary.total_max;$("#spPct").textContent=x.summary.percent+"%";$("#spGrade").textContent=x.summary.grade;
  const spMissing=$("#spMissing"); if(spMissing)spMissing.textContent=`${missingWorkCountFromAssignments(x.assignments)} ชิ้น`;
}

async function loadStudentPortal(token,year=studentViewYear,term=studentViewSemester){
  if(studentPortalBusy)return;
  studentPortalBusy=true;
  $("#spError").textContent="";
  try{
    const {data,error}=await sb.rpc("student_portal",{p_token:token,p_academic_year:year,p_semester:term});
    if(error)throw error;
    const x=Array.isArray(data)?data[0]:data;
    if(!x||!x.student){throw new Error("ไม่พบข้อมูลจากลิงก์นี้")}
    studentViewYear=year;studentViewSemester=term;syncStudentTermSelectors();
    renderStudentPortalData(x);
    const notice=$("#studentTermNotice");if(notice)notice.textContent=`กำลังแสดงคะแนนปีการศึกษา ${year} ภาคเรียนที่ ${term}`;
  }catch(e){$("#spName").textContent="ไม่พบข้อมูล";$("#spRoom").textContent="";$("#spScores").innerHTML="";$("#spError").textContent=e.message}
  finally{studentPortalBusy=false;}
}

let modalSaveFn=null;
function openModal(title,body,fn){$("#modalTitle").textContent=title;$("#modalBody").innerHTML=body;modalSaveFn=fn;$("#modal").classList.remove("hidden")}
function closeModal(){$("#modal").classList.add("hidden");modalSaveFn=null}
$("#modalCancel").onclick=closeModal;$("#modalSave").onclick=()=>modalSaveFn?.();

boot();
