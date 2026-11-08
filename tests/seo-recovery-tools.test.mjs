import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {createRequire} from 'node:module';
const rules=createRequire(import.meta.url)('../employment-rules.js');
const root=new URL('../',import.meta.url);
const attr=(tag,name)=>tag.match(new RegExp('\\b'+name+'=["\']([^"\']*)["\']','i'))?.[1]||'';

// Minimal DOM fixture executes the shipped scripts. Expected amounts below are
// independent worked cases, not output copied from the calculator under test.
async function harness(file){
 const html=await readFile(new URL(file,root),'utf8'), elements=new Map(), listeners=[];
 function element(id='',tag=''){
  const classes=new Set(), events=new Map();
  return {id,value:attr(tag,'value'),defaultValue:attr(tag,'value'),min:attr(tag,'min'),max:attr(tag,'max'),type:attr(tag,'type'),style:{},validity:{badInput:false},innerText:'',textContent:'',innerHTML:'',labels:[],options:[],checked:/\bchecked\b/.test(tag),classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,b)=>b?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},addEventListener:(event,callback)=>events.set(event,callback),appendChild(){},insertAdjacentHTML(){},setAttribute(){},getAttribute(){return ''},scrollIntoView(){},focus(){},dispatchEvent(){},click(){events.get('click')?.();}};
 }
 for(const match of html.matchAll(/<[^>]+\bid=["']([^"']+)["'][^>]*>/g))elements.set(match[1],element(match[1],match[0]));
 for(const match of html.matchAll(/<select\b[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/g)){
  const options=[...match[2].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(m=>({value:attr(m[1],'value'),text:m[2],defaultSelected:/\bselected\b/.test(m[1])}));
  const field=elements.get(match[1]);field.options=options;field.value=(options.find(x=>x.defaultSelected)||options[0])?.value||'';
 }
 const storage=new Map();
 const document={getElementById:id=>elements.get(id),querySelector:s=>s.includes('empType')?{value:'non-workman'}:{href:'https://sg-salary-calculator.vercel.app/'+file},querySelectorAll:s=>[...elements.values()].filter(e=>s.includes('type="number"')?e.type==='number':s.includes('input')?['number','text','range','radio'].includes(e.type):false),createElement:()=>element(),documentElement:{setAttribute(){},getAttribute(){return 'light'}}};
 const context=vm.createContext({document,console,Intl,Date,Number,Math,JSON,Set,Map,Event:class{},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},matchMedia:()=>({matches:false}),setTimeout(){},alert(){},navigator:{clipboard:{writeText:()=>Promise.resolve()}},location:{reload(){}}});
 context.window=context;context.addEventListener=(event,callback)=>{if(event==='DOMContentLoaded')listeners.push(callback);};
 vm.runInContext(await readFile(new URL('planning-inputs.js',root),'utf8'),context);
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(!/src=|application\/ld\+json/i.test(match[1]))vm.runInContext(match[2],context);
 }
 listeners.forEach(fn=>fn());
 context.scrollTo=()=>{};
 return {context,el:id=>elements.get(id),click:id=>elements.get(id).click(),set:values=>Object.entries(values).forEach(([id,value])=>{elements.get(id).value=String(value);}),run:code=>vm.runInContext(code,context)};
}
const salaryNormal={basicSalary:4000,weeklyHours:44,ot15:0,ot20:0,ageGroup:'55'};

test('Salary independent 4000/no OT, age bands and 8000 ceiling percentage estimates',async()=>{
 const h=await harness('salary-calculator.html');h.set(salaryNormal);h.run('calcSalary()');
 assert.equal(h.el('resNet').innerText,'S$3,200.00');assert.equal(h.el('resEmployerCPF').innerText,'+S$680.00');
 for(const [age,net] of [['60','S$3,280.00'],['65','S$3,500.00'],['70','S$3,700.00'],['75','S$3,800.00']]){h.set({ageGroup:age});h.run('calcSalary()');assert.equal(h.el('resNet').innerText,net);}
 h.set({...salaryNormal,basicSalary:9000});h.run('calcSalary()');assert.equal(h.el('resNet').innerText,'S$7,400.00');
 h.set({...salaryNormal,basicSalary:2600,ot15:20});h.run('calcSalary()');assert.equal(h.el('resOT').innerText,'S$409.09');assert.equal(h.el('resNet').innerText,'S$2,407.27');
});

test('Salary invalid, zero, empty, extreme, non-finite and unsupported lower wages clear prior results',async()=>{
 for(const overrides of [{basicSalary:''},{basicSalary:0},{basicSalary:-1},{basicSalary:500},{basicSalary:750},{basicSalary:10000001},{basicSalary:'1e309'},{weeklyHours:0},{weeklyHours:''},{ot15:-1},{ot20:745}]){
  const h=await harness('salary-calculator.html');h.set(salaryNormal);h.run('calcSalary()');assert.equal(h.context.__salaryValid,true);
  h.set(overrides);h.run('calcSalary()');assert.equal(h.context.__salaryValid,false,JSON.stringify(overrides));assert.equal(h.el('resultBox').style.display,'none');assert.ok(h.el('salaryInputError').textContent);
  assert.doesNotThrow(()=>h.run('copyResults();downloadTxtReport()'));
 }
});

test('Salary reset clears input and current estimate',async()=>{
 const h=await harness('salary-calculator.html');h.set(salaryNormal);h.run('calcSalary();resetSalary()');
 assert.equal(h.el('basicSalary').value,'');assert.equal(h.el('weeklyHours').value,'44');assert.equal(h.context.__salaryValid,false);assert.equal(h.el('resultBox').style.display,'none');
});

test('Offer comparison independently reconciles annual cash, CPF, costs, time and AW cap',async()=>{
 const h=await harness('offer-comparison-calculator.html');h.set({aSalary:5000,aAllowance:200,aAws:1,aBonus:1,aBenefits:1000,aHours:44,aCommuteDays:5,aCommute:60,aLeave:14,aCost:150});
 h.click('compareButton');
 const a=h.context.currentComparison.a;
 assert.equal(a.annualCash,72400);assert.equal(a.employeeCpf,14480);assert.equal(a.cashAfterCpfAndCosts,56120);
 assert.ok(Math.abs(a.annualTimeHours-2410.8)<1e-8);assert.ok(Math.abs(a.effectiveHourly-(57120/2410.8))<1e-8);
 h.set({aSalary:9000,aAllowance:0,aAws:1,aBonus:1});h.click('compareButton');
 assert.equal(h.context.currentComparison.a.cpfApplicableWages,102000);assert.equal(h.context.currentComparison.a.employeeCpf,20400);
});

test('Offer invalid data and unsupported wages cannot leave a comparison or export stale results',async()=>{
 for(const overrides of [{aSalary:''},{aSalary:0},{aSalary:-1},{aSalary:750},{aSalary:'1e309'},{aHours:0},{aHours:''},{aCost:-1},{aCommute:601},{aSalary:10000001}]){
  const h=await harness('offer-comparison-calculator.html');h.click('compareButton');assert.ok(h.context.currentComparison);
  h.set(overrides);h.click('compareButton');assert.equal(h.context.currentComparison,null,JSON.stringify(overrides));assert.ok(h.el('offerInputError').textContent);assert.equal(h.el('results').classList.contains('show'),false);
 }
 const h=await harness('offer-comparison-calculator.html');h.set({cpfStatus:'none',aSalary:500,bSalary:600});h.click('compareButton');assert.equal(h.context.currentComparison.a.employeeCpf,0);
 h.click('resetButton');assert.equal(h.context.currentComparison,null);assert.equal(h.el('aSalary').value,'5000');
});

test('Job switch independent worked annual values, switching costs and break-even',async()=>{
 const h=await harness('job-switch-worth-it-calculator.html');h.set({currentSalary:5000,currentAllowance:0,currentAws:1,currentBonus:1,currentBenefits:1000,currentCost:150,currentHours:44,currentOfficeDays:5,currentCommute:60,newSalary:5800,newAllowance:0,newAws:0,newBonus:1.5,newBenefits:1500,newCost:120,newHours:45,newOfficeDays:3,newCommute:75,buyoutAmount:0,gapDays:7,oneTimeCost:300});h.run('calculateSwitch(false)');
 const r=h.context.__lastResult;
 assert.equal(r.current.annualGrossCash,70000);assert.equal(r.current.cpf.employee,14000);assert.equal(r.current.annualValue,55200);
 assert.equal(r.next.annualGrossCash,78300);assert.equal(r.next.annualValue,62700);
 assert.ok(Math.abs(r.cost.total-(5000*7/30+300))<1e-8);assert.equal(r.monthlyGain,625);
 assert.ok(Math.abs(r.netAnnualGain-(7500-5000*7/30-300))<1e-8);assert.ok(Math.abs(r.breakEven-2.3466666666666667)<1e-8);
});

test('Job switch invalid input clears results and blocks copy and download without crashing',async()=>{
 for(const overrides of [{currentSalary:''},{newSalary:0},{newSalary:-1},{newSalary:500},{newHours:0},{newHours:''},{gapDays:-1},{gapDays:366},{oneTimeCost:'1e309'},{buyoutAmount:10000001}]){
  const h=await harness('job-switch-worth-it-calculator.html');h.run('calculateSwitch(false)');assert.ok(h.context.__lastResult);
  h.set(overrides);h.run('calculateSwitch(false)');assert.equal(h.context.__lastResult,null,JSON.stringify(overrides));assert.ok(h.el('switchInputError').textContent);assert.equal(h.el('results').classList.contains('show'),false);assert.doesNotThrow(()=>h.run('copyResults();downloadReport()'));
 }
 const h=await harness('job-switch-worth-it-calculator.html');h.set({cpfStatus:'none',currentSalary:500,newSalary:600});h.run('calculateSwitch(false)');assert.equal(h.context.__lastResult.current.cpf.employee,0);
});

test('Annual Leave independent first-year balance, invalid dates, blanks, negative and extreme values',()=>{
 const input={hireDate:'2026-01-01',calculationDate:'2026-12-31',leaveYearType:'calendar',leaveYearReference:'2026-06-01',contractAnnualDays:14,contractProrationPolicy:'completed-months',contractEligibilityPolicy:'after-three-months',usedDays:4,carriedDays:2,adjustmentDays:-1,unpaidRanges:[],unpaidTotalDays:''};
 const good=rules.calculateAnnualLeave(input);assert.equal(good.statutory.balance,3);assert.equal(good.contract.balance,11);
 for(const override of [{hireDate:''},{hireDate:'2026-02-30'},{calculationDate:'2025-12-31'},{usedDays:-1},{usedDays:Infinity},{contractAnnualDays:100000000000000000000}])assert.ok(rules.calculateAnnualLeave({...input,...override}).errors.length,JSON.stringify(override));
 const zero=rules.calculateAnnualLeave({...input,usedDays:0,carriedDays:0,adjustmentDays:0});assert.equal(zero.statutory.balance,7);
});

test('Resignation independent daily rates, notice boundary, missing/illegal dates and extreme money',()=>{
 assert.equal(rules.grossDailyRate(5200,5),240);assert.equal(rules.grossDailyRate(5200,6),200);assert.equal(rules.incompleteMonthSalary(5200,20,7),1820);
 assert.equal(rules.formatCivilDate(rules.calendarNoticeEnd('2026-01-31',1,'months')),'2026-02-28');
 assert.throws(()=>rules.parseCivilDate('2026-02-30'));assert.throws(()=>rules.parseCivilDate(''));
 assert.throws(()=>rules.grossDailyRate(-1,5));assert.throws(()=>rules.grossDailyRate(Infinity,5));
 assert.throws(()=>rules.grossDailyRate(0,5));assert.throws(()=>rules.incompleteMonthSalary(5200,0,0));
});
