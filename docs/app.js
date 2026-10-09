"use strict";
const $ = id => document.getElementById(id);
function reset() {
  $("summary").textContent = "Import a report to see recent activity.";
  $("counts").replaceChildren();
  $("events").replaceChildren();
}
function loadReport(text) {
  reset();
  try {
    if (text.length > 2_000_000) throw Error("Report too large");
    const report = JSON.parse(text);
    if (report.schemaVersion !== 1 || !Array.isArray(report.events) || report.events.length > 5000) throw Error("Unsupported report format");
    const events = report.events.map(e => {
      if (typeof e.packageName !== "string" || e.packageName.length > 300 || !Number.isFinite(e.timestamp)) throw Error("Invalid event");
      return {packageName:e.packageName,timestamp:e.timestamp};
    }).sort((a,b)=>b.timestamp-a.timestamp);
    $("summary").textContent = events.length + " app openings in report. Generated " + new Date(report.generatedAt).toLocaleString() + ".";
    const counts = new Map();
    events.forEach(e=>counts.set(e.packageName,(counts.get(e.packageName)||0)+1));
    const list = document.createElement("ul");
    [...counts].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([name,count])=>{
      const li=document.createElement("li");li.textContent=name+" — "+count+" openings";list.append(li);
    });
    $("counts").append(list);
    events.slice(0,500).forEach(e=>{
      const tr=document.createElement("tr");
      [new Date(e.timestamp).toLocaleString(),e.packageName].forEach(value=>{
        const td=document.createElement("td");td.textContent=value;tr.append(td);
      });
      $("events").append(tr);
    });
    $("status").textContent = "Report loaded. Data remains in this tab only.";
  } catch(err) { reset();$("status").textContent="Unable to load report: "+err.message; }
}
$("load").addEventListener("click",()=>loadReport($("paste").value));
$("file").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  if(file.size>2_000_000){$("status").textContent="File too large";return;}
  loadReport(await file.text());
});
$("clear").addEventListener("click",()=>{$("paste").value="";$("file").value="";reset();$("status").textContent="Cleared.";});
