const $ = id => document.getElementById(id);
let tasks = [];
let busy = false;

function log(title, detail, icon="✦") {
  const node = document.createElement("div");
  node.className = "activity-item";
  const dot = document.createElement("span"); dot.className="dot"; dot.textContent=icon;
  const body = document.createElement("div");
  const b = document.createElement("b"); b.textContent=title;
  const p = document.createElement("p"); p.textContent=detail;
  body.append(b,p); node.append(dot,body); $("activity").prepend(node);
}
function renderTasks() {
  const host=$("tasks"); host.replaceChildren();
  if(!tasks.length){host.innerHTML='<p class="empty">No tasks created yet.</p>';return;}
  tasks.forEach(t=>{
    const row=document.createElement("div");row.className="task"+(t.done?" done":"");
    const cb=document.createElement("input");cb.type="checkbox";cb.checked=!!t.done;cb.setAttribute("aria-label","Mark task complete");
    cb.addEventListener("change",()=>{t.done=cb.checked;renderTasks();});
    const text=document.createElement("div");text.className="tasktext";
    const strong=document.createElement("strong");strong.textContent=t.title;
    const small=document.createElement("small");small.textContent=`Day ${t.day||1} · ${t.minutes||30} min${t.description?" · "+t.description:""}`;
    text.append(strong,small);
    const badge=document.createElement("span");badge.className="priority";badge.textContent=t.priority||"MEDIUM";
    row.append(cb,text,badge);host.append(row);
  });
}
function toolsDescription(){return [
{name:"create_tasks",description:"Add actionable tasks to the user's execution board. Use this to turn a goal into a schedule. Input JSON: {tasks:[{title,description,day,minutes,priority}]}"},
{name:"list_tasks",description:"Return current tasks and completion status. Input JSON: {}"},
{name:"prioritize_tasks",description:"Sort tasks by priority then day. Input JSON: {}"},
{name:"reflect_progress",description:"Inspect completion status and decide what should change. Input JSON: {}"},
{name:"write_report",description:"Write the final concise plan and next steps. Input JSON: {report:string}"}
];}
function executeTool(name,args){
  if(name==="create_tasks"){
    const incoming=Array.isArray(args.tasks)?args.tasks:[];
    const added=incoming.slice(0,20).map((t,i)=>({
      id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+i),
      title:String(t.title||"Untitled task").slice(0,120),
      description:String(t.description||"").slice(0,240),
      day:Math.max(1,Math.min(30,Number(t.day)||1)),
      minutes:Math.max(5,Math.min(480,Number(t.minutes)||30)),
      priority:["HIGH","MEDIUM","LOW"].includes(String(t.priority||"").toUpperCase())?String(t.priority).toUpperCase():"MEDIUM",
      done:false
    }));
    tasks.push(...added);renderTasks();return {created:added.length,tasks:added};
  }
  if(name==="list_tasks")return {tasks:tasks.map(({title,day,minutes,priority,done})=>({title,day,minutes,priority,done}))};
  if(name==="prioritize_tasks"){tasks.sort((a,b)=>({HIGH:0,MEDIUM:1,LOW:2}[a.priority]-({HIGH:0,MEDIUM:1,LOW:2}[b.priority]))||a.day-b.day);renderTasks();return {sorted:true,tasks:tasks.map(t=>t.title)};}
  if(name==="reflect_progress"){const done=tasks.filter(t=>t.done).length;return {total:tasks.length,completed:done,remaining:tasks.length-done,reflection:done===tasks.length&&tasks.length?"All tasks complete.":"Focus on the highest-priority incomplete task next."};}
  if(name==="write_report"){ $("report").textContent=String(args.report||"No report was produced.");$("report").classList.remove("empty");return {written:true};}
  return {error:"Unknown tool"};
}
function renderFunctionDeclarations(){
 return toolsDescription().map(t=>({name:t.name,description:t.description,parameters:{
  type:"OBJECT",properties:t.name==="create_tasks"?{tasks:{type:"ARRAY",items:{type:"OBJECT",properties:{title:{type:"STRING"},description:{type:"STRING"},day:{type:"INTEGER"},minutes:{type:"INTEGER"},priority:{type:"STRING",enum:["HIGH","MEDIUM","LOW"]}},required:["title","day","minutes","priority"]}}}:t.name==="write_report"?{report:{type:"STRING"}}:{},required:t.name==="create_tasks"?["tasks"]:t.name==="write_report"?["report"]:[]
 }}));
}
async function callGemini(apiKey,contents){
 const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(apiKey),{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({contents,tools:[{function_declarations:renderFunctionDeclarations()}],generationConfig:{temperature:0.25}})
 });
 const data=await response.json();
 if(!response.ok)throw new Error(data.error?.message||"Gemini request failed ("+response.status+")");
 return data;
}
function extractText(candidate){return (candidate?.content?.parts||[]).filter(p=>p.text).map(p=>p.text).join("\n");}
async function runAgent(){
 if(busy)return;
 const key=$("apiKey").value.trim(),goal=$("goal").value.trim();
 if(!key){alert("Enter a Gemini API key first.");return;}
 if(!goal){alert("Describe the goal you want the agent to achieve.");return;}
 busy=true;$("runAgent").disabled=true;$("runAgent").textContent="Agent working…";$("status").textContent="Running";
 $("activity").replaceChildren();$("report").textContent="Agent is working…";$("report").classList.add("empty");tasks=[];renderTasks();
 log("Goal received",goal,"◎");
 const days=Math.max(1,Math.min(30,Number($("days").value)||5));
 const hours=Math.max(1,Math.min(12,Number($("hours").value)||2));
 let contents=[{role:"user",parts:[{text:`You are ORBIT, an agentic study and productivity planner. Goal: ${goal}\nPlanning horizon: ${days} days. Available time per day: ${hours} hours.\nWork autonomously using tools, not just chat. Follow this workflow: (1) reason about the goal and create a realistic day-by-day plan using create_tasks; (2) call list_tasks and inspect it; (3) call prioritize_tasks; (4) call reflect_progress; (5) call write_report with a concise report that includes strategy, day-wise focus, key assumptions, and the next action. Use at least 4 tool calls and finish within 8 model turns. Keep task total per day within available hours. Be specific and educational. Never claim an external action was performed. For this demo, progress reflection should transparently state that completion is currently user-marked.`}]}];
 try{
  for(let turn=0;turn<8;turn++){
   const data=await callGemini(key,contents);
   const candidate=data.candidates?.[0];
   if(!candidate)throw new Error("No response from model.");
   contents.push({role:"model",parts:candidate.content?.parts||[{text:""}]});
   const calls=(candidate.content?.parts||[]).filter(p=>p.functionCall?.name);
   if(!calls.length){
    const txt=extractText(candidate);
    if(txt){log("Agent response",txt,"AI");}
    if(!$("report").textContent||$("report").textContent==="Agent is working…"){$("report").textContent=txt||"Agent finished without a report."; $("report").classList.remove("empty");}
    break;
   }
   const results=[];
   for(const part of calls){
    const fc=part.functionCall, args=fc.args||{};
    log("Tool call: "+fc.name,JSON.stringify(args),"⚙");
    const result=executeTool(fc.name,args);
    log("Tool result: "+fc.name,JSON.stringify(result),"✓");
    results.push({functionResponse:{name:fc.name,response:result}});
   }
   contents.push({role:"user",parts:results});
   if(turn===7)log("Safety stop","Reached the maximum number of agent turns.","!");
  }
  $("status").textContent="Complete";
 }catch(e){$("status").textContent="Error";log("Agent error",e.message,"!");$("report").textContent="The agent stopped: "+e.message+"\nCheck your API key, quota, and network connection."; $("report").classList.remove("empty");}
 finally{busy=false;$("runAgent").disabled=false;$("runAgent").textContent="✦ Run agent";}
}
$("runAgent").addEventListener("click",runAgent);
$("toggleKey").addEventListener("click",()=>{const x=$("apiKey");x.type=x.type==="password"?"text":"password";$("toggleKey").textContent=x.type==="password"?"Show":"Hide";});
$("clearTasks").addEventListener("click",()=>{tasks=[];renderTasks();});
$("copyReport").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("report").textContent);$("copyReport").textContent="Copied";setTimeout(()=>$("copyReport").textContent="Copy report",1200);}catch{alert("Select and copy the report manually.");}});
